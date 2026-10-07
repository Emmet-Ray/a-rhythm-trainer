"""单人实例迁移与写入：临时库、无真实数据或模型调用。"""

import json
import sqlite3

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text, inspect

from main import create_app
from db.database import create_database_engine
from db.initialize import initialize_database
from test_custom_exercises import exercise

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture
def client():
    with TestClient(create_app(), headers=ORIGIN) as value:
        yield value


def record():
    return {
        "id": "record-1",
        "exerciseId": "old",
        "title": "旧练习",
        "source": "custom",
        "mode": "dictation",
        "exercise": exercise(),
        "startedAt": "2026-10-01T00:00:00Z",
        "updatedAt": "2026-10-01T00:00:00Z",
        "attempts": [
            {
                "id": "answer-1",
                "startedAt": "2026-10-01T00:00:00Z",
                "completedAt": None,
                "viewedAnswer": False,
                "measures": [
                    {
                        "questionPlayCount": 1,
                        "verificationCount": 0,
                        "verdict": "unchecked",
                    }
                ],
            }
        ],
    }


def create(client, item=None):
    result = client.post('/api/local-data/records', json=item or record())
    assert result.status_code == 200, result.text
    return result.json()['id']


def body(item):
    return {'attempt': item['attempts'][0], 'title': item['title'], 'updatedAt': item['updatedAt']}


def detail(client, id='record-1'):
    result = client.get('/api/local-data/records/' + id)
    assert result.status_code == 200, result.text
    return result.json()


def test_create_retry_and_update_are_separate(client):
    item = record()
    create(client, item)
    create(client, item)
    item['attempts'][0]['measures'][0]['questionPlayCount'] = 3
    assert client.put('/api/local-data/records/record-1/attempts/answer-1', json=body(item)).status_code == 200
    create(client)  # 迟到的创建重试不能覆盖后来的更新
    assert detail(client)['total'] == 1
    assert detail(client)['attempts'][0]['measures'][0]['questionPlayCount'] == 3
    assert client.put('/api/local-data/records/record-1/attempts/missing', json={**body(item), 'attempt': {**item['attempts'][0], 'id': 'missing'}}).status_code == 404
    assert detail(client)['total'] == 1


def test_same_score_reuses_archive_changed_score_creates_new(client):
    create(client)
    same = record(); same['id'] = 'another'; same['attempts'][0]['id'] = 'answer-2'
    same['exercise']['measures'][0]['elements'][0]['dots'] = 0
    assert create(client, same) == 'record-1'
    assert detail(client)['total'] == 2
    changed = record(); changed['id'] = 'changed'; changed['attempts'][0]['id'] = 'answer-3'
    changed['exercise']['measures'][0]['elements'] = [{'kind':'note','noteValue':'half'}]*2
    assert create(client, changed) == 'changed'
    assert client.get('/api/local-data/records/summary').json() == {'recordCount':2,'attemptCount':3}


def test_deleted_archive_rejects_old_updates_and_new_attempts(client):
    create(client)
    assert client.delete('/api/local-data/records/record-1').status_code == 200
    assert client.put('/api/local-data/records/record-1/attempts/answer-1', json=body(record())).status_code == 404
    assert client.post('/api/local-data/records/record-1/attempts', json=body(record())).status_code == 404
    assert client.get('/api/local-data/records/summary').json() == {'recordCount':0,'attemptCount':0}
    # 接受的简化边界：明确的新建请求仍可创建，不保留删除代数/墓碑
    create(client)
    assert client.delete('/api/local-data/records').status_code == 200
    assert client.get('/api/local-data/records/summary').json()['attemptCount'] == 0


def test_attempt_id_cannot_move_between_archives(client):
    create(client)
    other = record(); other['id'] = 'other'; other['exerciseId'] = 'other'
    assert client.post('/api/local-data/records', json=other).status_code == 422
    assert client.get('/api/local-data/records/summary').json()['recordCount'] == 1


def test_list_filters_statistics_and_attempt_pagination(client):
    item = record()
    item['attempts'] = [{**item['attempts'][0], 'id': f'answer-{i:02}', 'startedAt': f'2026-10-{i+1:02}T00:00:00Z'} for i in range(12)]
    create(client, item)
    result = client.get('/api/local-data/records', params={'after':'2026-10-10T00:00:00Z','before':'2026-10-12T23:00:00Z','zone':'Asia/Shanghai'}).json()
    assert result['overview']['count'] == 3
    assert result['overview']['days'] == 3
    assert result['records'][0]['attemptCount'] == 12
    assert 'attempts' not in result['records'][0]
    assert detail(client)['total'] == 12
    assert len(detail(client)['attempts']) == 10
    second = client.get('/api/local-data/records/record-1?page=2').json()
    assert [a['id'] for a in second['attempts']] == ['answer-00','answer-01']
    assert client.get('/api/local-data/records?mode=tapping').json()['total'] == 0
    assert client.get('/api/local-data/records?zone=invalid').status_code == 422
    for i in range(11):
        other = record(); other.update(id=f'other-{i}',exerciseId=f'other-{i}')
        other['attempts'][0]['id'] = f'other-answer-{i}'
        create(client, other)
    result = client.get('/api/local-data/records?page=999&before=2027-01-01T00:00:00Z').json()
    assert result['total'] == 12
    assert result['page'] == 2 and len(result['records']) == 2


def test_history_lookup_and_progress(client):
    create(client)
    target = {k: record()[k] for k in ('source','exerciseId','exercise','mode')}
    result = client.post('/api/local-data/records/lookup', json=target).json()
    assert result['record']['id'] == 'record-1'
    assert result['total'] == 1
    assert client.post('/api/local-data/records/lookup', json={**target,'exerciseId':'missing'}).json() is None
    result = client.post('/api/local-data/records/progress', json={'targets':[target]}).json()
    assert result[0]['attemptCount'] == 1 and 'attempts' not in result[0]


@pytest.mark.parametrize('change',[
    lambda r:r['attempts'][0].update(measures=[None]),
    lambda r:r['attempts'][0].update(answerMeasures=[[{'kind':'note','noteValue':'bad'}]]),
    lambda r:r['attempts'][0].update(playbackSettings=[None]),
    lambda r:r['attempts'][0].update(completedAt='2026-10-02T00:00:00Z'),
])
def test_invalid_attempt_never_overwrites(client,change):
    create(client)
    item=record();change(item)
    assert client.put('/api/local-data/records/record-1/attempts/answer-1',json=body(item)).status_code == 422
    assert detail(client)['attempts']==record()['attempts']


def test_upgrade_preserves_every_attempt_and_only_three_business_tables(tmp_path, monkeypatch, migration_config):
    database=tmp_path/'old.db'
    monkeypatch.setenv('DATABASE_URL',f'sqlite:///{database}')
    command.upgrade(migration_config,'0008_simplify_record_storage')
    engine=create_database_engine()
    with engine.begin() as c:
        c.execute(text("UPDATE practice_record_store SET value=:value WHERE key='records'"),{'value':json.dumps({'version':3,'records':[record()]})})
        c.execute(text("INSERT INTO custom_exercises(id,name,mode,exercise) VALUES ('old','旧题','dictation',:value)"),{'value':json.dumps(exercise())})
    initialize_database(engine)
    assert database.with_name(database.name+'.before-0008_simplify_record_storage.bak').exists()
    with TestClient(create_app(),headers=ORIGIN) as client:
        assert detail(client)['attempts'] == record()['attempts']
        assert client.get('/api/custom-exercises/old').json()['exercise'] == exercise()
        assert client.delete('/api/local-data/exercises').status_code == 200
        assert detail(client)['attempts'] == record()['attempts']
    with engine.connect() as c:
        tables=set(inspect(c).get_table_names())-{'alembic_version','sqlite_sequence'}
        assert tables=={'custom_exercises','practice_records','practice_attempts'}
        assert 'revision' not in {col['name'] for col in inspect(c).get_columns('practice_attempts')}
        assert c.execute(text('PRAGMA foreign_key_check')).fetchall()==[]
    engine.dispose()


def test_duplicate_attempt_ids_abort_migration_without_losing_document(tmp_path,monkeypatch,migration_config):
    database=tmp_path/'bad.db';monkeypatch.setenv('DATABASE_URL',f'sqlite:///{database}')
    command.upgrade(migration_config,'0008_simplify_record_storage')
    engine=create_database_engine()
    records=[record(),{**record(),'id':'other','exerciseId':'other'}]
    with engine.begin() as c:
        c.execute(text("UPDATE practice_record_store SET value=:value WHERE key='records'"),{'value':json.dumps({'version':3,'records':records})})
    with pytest.raises(Exception):initialize_database(engine)
    with engine.connect() as c:
        assert c.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0008_simplify_record_storage'
        assert json.loads(c.execute(text('SELECT value FROM practice_record_store')).scalar())['records']==records
    engine.dispose()


@pytest.mark.parametrize('path',['/import','/legacy-accounts','/legacy-sessions'])
def test_temporary_routes_removed(client,path):
    assert client.get('/api/local-data'+path).status_code==404


def test_overview_counts_attempts_local_days_and_independent_completion(client):
    tap = {**record(), 'id':'tap','exerciseId':'tap','mode':'tapping','attempts':[
        {'id':f'tap-{i}','completedAt':day,'bpm':60,'timingWindows':{'perfectMs':50,'hitMs':150},
         'targetCount':1,'hitCount':int(passed),'missCount':int(not passed),'wrongTapCount':0,'passed':passed}
        for i,(day,passed) in enumerate([('2026-09-01T00:00:00Z',False),('2026-09-22T00:00:00Z',True),('2026-09-22T01:00:00Z',False)])]}
    create(client,tap)
    item=record();item['attempts']=[]
    for i,(start,done,viewed) in enumerate([('2026-09-21T00:00:00Z',True,False),('2026-09-22T00:00:00Z',True,True),('2026-09-22T01:00:00Z',False,False)]):
        item['attempts'].append({**record()['attempts'][0], 'id':f'dictation-{i}','startedAt':start,
            'completedAt':'2026-09-22T02:00:00Z' if done else None,'viewedAnswer':viewed,
            'measures':[{'questionPlayCount':1,'verificationCount':int(done),'verdict':'correct' if done else 'unchecked'}]})
    create(client,item)
    result=client.get('/api/local-data/records',params={'after':'2026-09-16T00:00:00+08:00','before':'2026-09-22T12:00:00+08:00','zone':'Asia/Shanghai'}).json()
    assert result['overview']=={'count':5,'days':2,'tappingCount':2,'passedCount':1,'passRate':50,'dictationCount':3,'completedCount':2,'independentCount':1}
    assert detail(client,'tap')['total']==3
    client.delete('/api/local-data/records/tap')
    assert client.get('/api/local-data/records?mode=tapping').json()['overview']['passRate'] is None


def test_time_window_inclusive_local_boundary_excludes_future_and_uses_dictation_start(client):
    item=record();item['attempts']=[]
    for i,start in enumerate(['2026-09-15T15:59:59Z','2026-09-15T16:00:00Z','2026-09-22T03:00:00Z','2026-09-22T05:00:00Z']):
        item['attempts'].append({**record()['attempts'][0], 'id':f'window-{i}','startedAt':start})
    create(client,item)
    result=client.get('/api/local-data/records',params={'after':'2026-09-16T00:00:00+08:00','before':'2026-09-22T12:00:00+08:00','zone':'Asia/Shanghai'}).json()
    assert result['overview']['count']==2
    assert result['overview']['days']==2
    assert result['records'][0]['attemptCount']==4
