# Hack the Brewery - developer shortcuts
# Deployment is docker compose only: see README.md

.PHONY: help up down logs rebuild theme theme-admin serve shell reload-content

help:
	@echo "up             - start the stack (docker compose)"
	@echo "down           - stop the stack"
	@echo "logs           - follow application logs"
	@echo "rebuild        - rebuild images and restart"
	@echo "theme          - rebuild the student theme assets (colours/fonts)"
	@echo "theme-admin    - rebuild the admin theme assets"
	@echo "reload-content - re-sync challenges from data/ into the database"
	@echo "serve          - run the app locally without docker (development)"

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f app

rebuild:
	docker compose up -d --build

theme:
	cd CTFd/themes/core-beta && npm install --no-audit --no-fund && npm run build

theme-admin:
	cd CTFd/themes/admin && npm install --no-audit --no-fund && npm run build

reload-content:
	docker compose exec app python manage.py sync-content

serve:
	python serve.py

shell:
	python manage.py shell
