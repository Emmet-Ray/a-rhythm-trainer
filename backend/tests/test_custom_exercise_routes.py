import pytest
from fastapi.testclient import TestClient
from main import create_app
from test_custom_exercises import exercise

@pytest.fixture
def client():
    with TestClient(create_app(), headers={"Origin":"http://localhost:5173"}) as c:
        yield c

def test_without_login_and_restart(client):
    assert client.get('/api/auth/me').status_code == 404
    body = {"name":"题目", "mode":"tapping", "exercise":exercise()}
    result=client.post('/api/custom-exercises',json=body)
    assert result.status_code == 201, result.text
    identifier=result.json()['id']
    client.cookies.clear()
    assert client.get('/api/custom-exercises/'+identifier).status_code == 200
    assert client.put('/api/custom-exercises/'+identifier,json={"name":"修改","exercise":exercise()}).status_code == 200
    assert client.get('/api/custom-exercises?mode=tapping').json()['items'][0]['name']=='修改'
    assert client.delete('/api/custom-exercises/'+identifier).status_code==204
    assert client.get('/api/custom-exercises/'+identifier).status_code==404

@pytest.mark.parametrize('origin',['https://evil.example','null',''])
def test_mutation_origin_required(client,origin):
    assert client.post('/api/custom-exercises',headers={'Origin':origin},json={'name':'题','mode':'tapping','exercise':exercise()}).status_code==403

def test_bad_payload(client):
    for body in [{}, {'name':'题','mode':'tapping','exercise':{}}, {'name':'题','mode':'tapping','exercise':exercise(),'user_id':1}]:
        assert client.post('/api/custom-exercises',json=body).status_code==422

@pytest.mark.parametrize('query',['mode=bad','mode=tapping&limit=0','mode=tapping&limit=101','mode=tapping&offset=-1'])
def test_invalid_pagination(client,query):
    assert client.get('/api/custom-exercises?'+query).status_code==422

def test_mode_and_pagination(client):
    for mode in ('tapping','tapping','dictation'):
        assert client.post('/api/custom-exercises',json={'name':'同名','mode':mode,'exercise':exercise()}).status_code==201
    first=client.get('/api/custom-exercises?mode=tapping&limit=1').json()['items']
    second=client.get('/api/custom-exercises?mode=tapping&limit=1&offset=1').json()['items']
    assert len(first)==len(second)==1 and first[0]['id']!=second[0]['id']
    assert 'exercise' not in first[0] and 'user_id' not in first[0]
    assert len(client.get('/api/custom-exercises?mode=dictation').json()['items'])==1

@pytest.mark.parametrize('method',['post','put','delete'])
def test_commit_failure_does_not_report_success_or_modify_data(client,method):
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import SQLAlchemyError
    body={'name':'原题','mode':'tapping','exercise':exercise()}
    identifier=client.post('/api/custom-exercises',json=body).json()['id']
    def fail(_session):raise SQLAlchemyError('internal detail must not leak')
    event.listen(Session,'before_commit',fail)
    try:
        if method=='post':response=client.post('/api/custom-exercises',json=body)
        elif method=='put':response=client.put('/api/custom-exercises/'+identifier,json={'name':'新名称','exercise':exercise()})
        else:response=client.delete('/api/custom-exercises/'+identifier)
        assert response.status_code==503
        assert 'internal detail' not in response.text
    finally:
        event.remove(Session,'before_commit',fail)
    assert client.get('/api/custom-exercises/'+identifier).json()['name']=='原题'
    assert len(client.get('/api/custom-exercises?mode=tapping').json()['items'])==1

def test_database_read_failure_never_looks_empty(client,monkeypatch):
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import SQLAlchemyError
    def fail(*args,**kwargs):raise SQLAlchemyError('private path')
    monkeypatch.setattr(Session,'scalars',fail)
    response=client.get('/api/custom-exercises?mode=tapping')
    assert response.status_code==503
    assert 'private path' not in response.text
