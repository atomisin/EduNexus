import asyncio
import os

from app.core.config import settings
from app.services.livekit_service import LiveKitService

async def test():
    svc = LiveKitService()
    
    room = await svc.create_room(
        room_name='test-batch9-verification',
        max_participants=2
    )
    print(f'Room created: {room}')
    
    token = await svc.generate_token(
        room_name='test-batch9-verification',
        participant_identity='test-student-1',
        participant_name='Test Student',
        ttl_hours=1
    )
    print(f'Token generated: {token[:30]}...')
    
    participants = await svc.list_participants(
        'test-batch9-verification'
    )
    print(f'Participants: {participants}')
    
    deleted = await svc.delete_room(
        'test-batch9-verification'
    )
    print(f'Room deleted: {deleted}')

if __name__ == "__main__":
    asyncio.run(test())
