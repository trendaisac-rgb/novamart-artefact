.PHONY: setup ui test evals seed deploy

setup:
	npm install --no-package-lock
	python -m pip install -r evals/requirements.txt
	@test -f evals/.env || cp evals/.env.example evals/.env
	@echo "Fill evals/.env to run the evals"

# Web app, talking to the deployed Edge Function
ui:
	npm run dev -- --port 8080

# Offline tests of the agent loop and retrieval (needs Deno)
test:
	deno test --allow-read supabase/functions/nova

# Eval suite against the deployed agent
evals:
	python evals/run_evals.py

# Rebuild supabase/seed.sql after editing supabase/policies/*.md
seed:
	python scripts/build_seed.py

# Push schema, seed and function to the linked Supabase project
deploy:
	supabase db push --include-seed
	supabase functions deploy nova
