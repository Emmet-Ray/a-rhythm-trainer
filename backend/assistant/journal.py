"""JSONL 会话日志：串行追加、落盘和尾行恢复；格式版本在会话首行。

单进程部署。文件锁保护同一进程的线程写入；目录锁防止多个后端同时写同一数据目录。
只丢弃没有换行符的末尾片段，完整行损坏必须报错，不能当成不存在或空会话。
"""
import fcntl
import json
import logging
import os
from pathlib import Path
from threading import RLock


class SessionStorageError(Exception):
    pass


class SessionJournal:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._lock = RLock()
        self._failed: set[Path] = set()
        self._process_lock = (directory / '.writer.lock').open('a')
        try:
            fcntl.flock(self._process_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self._process_lock.close()
            raise SessionStorageError('会话目录已被另一个后端使用，请使用单 worker。') from None

    def close(self):
        self._process_lock.close()

    def path(self, owner: str, session_id: str) -> Path:
        # 所有路径组成部分均来自服务端；仍限制字符，拒绝目录穿越。
        if not owner or any(c not in '0123456789abcdef' for c in owner) or len(session_id) != 32 or any(c not in '0123456789abcdef' for c in session_id):
            raise KeyError(session_id)
        return self.directory / owner / f'{session_id}.jsonl'

    def append(self, owner: str, session_id: str, record: dict, *, create=False):
        path = self.path(owner, session_id)
        data = (json.dumps(record, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()
        with self._lock:
            if path in self._failed:
                raise SessionStorageError('上次写入未成功，请检查磁盘并重启后端以恢复日志。')
            try:
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with path.open('xb' if create else 'ab') as file:
                    file.write(data)
                    file.flush()
                    os.fsync(file.fileno())
            except OSError as error:
                self._failed.add(path)
                logging.getLogger(__name__).error('Session write failed: %s', type(error).__name__)
                raise SessionStorageError('对话保存失败，请检查数据目录和磁盘空间。') from None

    def read(self, owner: str, session_id: str) -> list[dict]:
        path = self.path(owner, session_id)
        with self._lock:
            try:
                with path.open('r+b') as file:
                    data = file.read()
                    if data and not data.endswith(b'\n'):
                        boundary = data.rfind(b'\n') + 1
                        file.truncate(boundary)
                        file.flush()
                        os.fsync(file.fileno())
                        data = data[:boundary]
                        logging.getLogger(__name__).warning('Recovered incomplete tail of session %s', session_id)
                records = [json.loads(line) for line in data.splitlines()]
                if not records or any(not isinstance(record, dict) for record in records):
                    raise ValueError()
                return records
            except FileNotFoundError:
                raise KeyError(session_id) from None
            except (ValueError, UnicodeError, OSError):
                raise SessionStorageError('对话文件无法读取或已损坏，原文件已保留，请检查备份。') from None

    def ids(self, owner: str):
        # 不跨归属目录扫描。
        folder = self.path(owner, '0' * 32).parent
        return [path.stem for path in folder.glob('*.jsonl')]

    def delete(self, owner: str, session_id: str):
        with self._lock:
            try:
                self.path(owner, session_id).unlink()
            except FileNotFoundError:
                raise KeyError(session_id) from None
            except OSError:
                raise SessionStorageError('删除对话失败，请检查数据目录。') from None
