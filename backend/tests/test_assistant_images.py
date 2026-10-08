import asyncio
import base64
from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError
from pydantic_ai import BinaryContent
from pydantic_ai.messages import UserPromptPart
from pydantic_ai.models.test import TestModel as SDKTestModel

from api.assistant import ChatInput
from assistant.messages import MessageImage
from assistant.journal import INSTANCE_OWNER
from assistant.model import ModelSelection, ConnectionError
from assistant.sessions import SessionStore
from assistant.messages import Turn


def picture():
    out = BytesIO()
    Image.new('RGB', (32, 32), 'white').save(out, format='PNG')
    return MessageImage(data=base64.b64encode(out.getvalue()).decode(), media_type='image/png')


@pytest.mark.parametrize('value', [
    {'data': 'invalid', 'media_type': 'image/png'},
    {'data': base64.b64encode(b'not an image').decode(), 'media_type': 'image/png'},
    {'data': base64.b64encode(b'<svg/>').decode(), 'media_type': 'image/svg+xml'},
])
def test_invalid_image_rejected(value):
    with pytest.raises(ValidationError):
        MessageImage.model_validate(value)


def test_image_constraints_and_image_only_message():
    image = picture()
    assert ChatInput(message_id='u1', images=[image]).text == ''
    with pytest.raises(ValidationError): ChatInput(message_id='u1', text=' ')
    with pytest.raises(ValidationError): ChatInput(message_id='u1', images=[image] * 4)
    with pytest.raises(ValidationError): MessageImage(data=image.data, media_type='image/jpeg')
    with pytest.raises(ValidationError): MessageImage(data='a' * (3 * 1024 * 1024), media_type='image/png')
    turn = Turn('u1', '', None, images=[image])
    content = turn.user_message().parts[0].content
    assert isinstance(content[1], BinaryContent) and content[1].data == image.content().data
    assert turn.ui_messages()[0]['parts'] == [image.ui_part()]


def test_images_survive_restart_and_are_not_repeated_in_checkpoints(tmp_path):
    image = picture()
    directory = tmp_path / 'sessions'
    store = SessionStore(directory)
    selection = ModelSelection(provider='deepseek', model='deepseek-flash')
    session = store.create(INSTANCE_OWNER, selection)
    sid = session.id
    async def send(current, text, message_id, images=None):
        async with current.run(text, SDKTestModel(call_tools=[], custom_output_text='已识别'),
                               message_id=message_id, images=images) as response:
            async for _ in response.body_iterator: pass
    asyncio.run(send(session, '', 'u1', [image]))
    assert session.title == '图片对话'
    store.close()
    restored = SessionStore(directory)
    try:
        session = restored.get(sid, INSTANCE_OWNER)
        assert session.turns[0].images == [image]
        assert session.snapshot()['messages'][0]['parts'] == [image.ui_part()]
        with pytest.raises(ConnectionError, match='包含图片'):
            session.select_model(ModelSelection(provider='deepseek', model='deepseek-v4-pro'), image_input=False)
        session.select_model(ModelSelection(provider='chatgpt', model='gpt-5.6-sol'))
        asyncio.run(send(session, '继续', 'u2'))
        records = restored.journal.read(INSTANCE_OWNER, sid)
        assert sum(len(r.get('turn', {}).get('images', [])) for r in records) == 1
        assert all(not any(isinstance(part, UserPromptPart) for m in turn.messages for part in m.parts) for turn in session.turns)
    finally: restored.close()


def test_first_image_write_already_blocks_incompatible_model(monkeypatch):
    import threading
    from assistant.sessions import ChatSession
    session = ChatSession()
    session.select_model(ModelSelection(provider='deepseek', model='deepseek-flash'))
    started, release = threading.Event(), threading.Event()
    save = session.save
    def blocked_save(record):
        if record['type'] == 'turn_started':
            started.set()
            assert release.wait(5)
        return save(record)
    monkeypatch.setattr(session, 'save', blocked_save)
    async def scenario():
        async def send():
            async with session.run('', SDKTestModel(call_tools=[], custom_output_text='ok'), message_id='u1', images=[picture()]) as response:
                async for _ in response.body_iterator: pass
        task = asyncio.create_task(send())
        try:
            assert await asyncio.to_thread(started.wait, 3)
            with pytest.raises(ConnectionError, match='包含图片'):
                session.select_model(ModelSelection(provider='deepseek', model='deepseek-v4-pro'), image_input=False)
        finally:
            release.set()
            await task
    asyncio.run(scenario())


@pytest.mark.parametrize('format,media_type', [('PNG', 'image/png'), ('WEBP', 'image/webp')])
def test_animated_images_rejected(format, media_type):
    out = BytesIO()
    frames = [Image.new('RGB', (8, 8), color) for color in ('white', 'black')]
    frames[0].save(out, format=format, save_all=True, append_images=frames[1:], duration=100)
    with pytest.raises(ValidationError):
        MessageImage(data=base64.b64encode(out.getvalue()).decode(), media_type=media_type)


def test_pixel_limit_rejected_even_when_file_is_small():
    out = BytesIO()
    Image.new('1', (4001, 4000)).save(out, format='PNG')
    assert len(out.getvalue()) < 2 * 1024 * 1024
    with pytest.raises(ValidationError):
        MessageImage(data=base64.b64encode(out.getvalue()).decode(), media_type='image/png')


@pytest.mark.parametrize('truncated', [False, True])
def test_jpeg_must_decode_completely(truncated):
    out = BytesIO()
    Image.new('RGB', (32, 32), 'white').save(out, format='JPEG')
    data = out.getvalue()[:-10] if truncated else out.getvalue()
    if truncated:
        with pytest.raises(ValidationError):
            MessageImage(data=base64.b64encode(data).decode(), media_type='image/jpeg')
    else:
        assert MessageImage(data=base64.b64encode(data).decode(), media_type='image/jpeg').content().data == data
