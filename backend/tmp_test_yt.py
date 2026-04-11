import asyncio
import logging
import json
from app.services.video_service import search_educational_videos

logger = logging.getLogger('app.services.video_service')
logger.setLevel(logging.DEBUG)

fh = logging.FileHandler('tmp_test_yt.log', mode='w')
fh.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(message)s')
fh.setFormatter(formatter)
logger.addHandler(fh)

async def test():
    videos = await search_educational_videos("Introduction to Workflow Orchestration", limit=5)
    with open('tmp_test_yt.log', 'a') as f:
        f.write(f"\nRESULTS:\n{json.dumps(videos, indent=2)}\n")

if __name__ == "__main__":
    asyncio.run(test())
