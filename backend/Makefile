test:
	docker-compose -f docker-compose.test.yml up -d
	timeout /t 5
	pytest tests/test_auth_integration.py tests/test_admin_integration.py -v
	docker-compose -f docker-compose.test.yml down
