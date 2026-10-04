"""应用层装配工具；与会话存储分离。"""

from assistant.tools.propose_rhythm_exercise import create_propose_rhythm_exercise_tool


def create_tools():
    return [create_propose_rhythm_exercise_tool()]
