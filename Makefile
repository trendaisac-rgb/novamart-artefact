.PHONY: setup api ui demo chat test evals gaps

AGENT := agent

setup:
	cd $(AGENT) && python -m pip install -e ".[dev]"
	@test -f $(AGENT)/.env || cp $(AGENT)/.env.example $(AGENT)/.env
	npm install --no-package-lock
	@echo "Now put your ANTHROPIC_API_KEY in agent/.env"

# Agent API for the web app
api:
	cd $(AGENT) && uvicorn novamart.server:app --port 8000 --reload

# Web app
ui:
	npm run dev -- --port 8080

# Both, in one terminal
demo:
	$(MAKE) -j2 api ui

chat:
	cd $(AGENT) && python -m novamart.cli --store S-012

test:
	cd $(AGENT) && pytest -q

evals:
	cd $(AGENT) && python evals/run_evals.py

gaps:
	cd $(AGENT) && python scripts/gap_report.py --summarize
