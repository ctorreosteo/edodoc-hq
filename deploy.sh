#!/usr/bin/env bash
# Pubblica backend (Cloud Run) e frontend (Firebase Hosting).
# Pubblica i file su disco, modifiche non committate comprese.
# Dalla cartella edodoc-hq:
#   ./deploy.sh              # backend e frontend
#   ./deploy.sh backend      # solo backend
#   ./deploy.sh frontend     # solo frontend
set -euo pipefail

target="${1:-tutto}"
case "$target" in
  tutto|backend|frontend) ;;
  *)
    echo "Uso: ./deploy.sh [backend|frontend]"
    exit 2
    ;;
esac

root="$(cd "$(dirname "$0")" && pwd)"
project="endless-grail-513417-e7"
region="europe-west8"
site="https://$project.web.app"

# Chiave del service account edodoc-deploy, fuori dal repo: non serve il login di gcloud
key="$HOME/.config/edodoc/edodoc-deploy.json"
if [[ ! -f "$key" ]]; then
  echo "Manca la chiave $key"
  exit 1
fi
export CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$key"
export CLOUDSDK_CORE_PROJECT="$project"

if [[ "$target" != "frontend" ]]; then
echo "=== Backend (Cloud Run, $region) ==="
(
  cd "$root/edodoc-backend"
  # --update e non --set: restano le variabili aggiunte dopo, come quelle di Cloudflare.
  # CPU sempre attiva e un'istanza minima: i job pianificati devono girare anche senza richieste.
  # LOGGING_FILE_NAME vuoto: su Cloud Run il disco è in memoria, i log vanno su Cloud Logging.
  # GOOGLE_SENZA_CHIAVE: l'organizzazione vieta le chiavi, la delega Google la firma IAM.
  # CORS: anche il sito edodoc.it, che prenota la chiamata conoscitiva su /api/pubblico.
  gcloud run deploy edodoc-backend \
      --source . \
      --region "$region" \
      --service-account "edodoc-backend@$project.iam.gserviceaccount.com" \
      --build-service-account "projects/$project/serviceAccounts/edodoc-build@$project.iam.gserviceaccount.com" \
      --add-cloudsql-instances "$project:$region:edodoc-db" \
      --port 8081 \
      --memory 1Gi \
      --min-instances 1 \
      --max-instances 3 \
      --no-cpu-throttling \
      --cpu-boost \
      --update-env-vars "^|^SPRING_DATASOURCE_URL=jdbc:postgresql:///edodochq?cloudSqlInstance=$project:$region:edodoc-db&socketFactory=com.google.cloud.sql.postgres.SocketFactory|DB_USERNAME=edodoc|ADMIN_EMAIL=edoardo@edodoc.it|CORS_ALLOWED_ORIGINS=https://hq.edodoc.it,$site,https://$project.firebaseapp.com,https://www.edodoc.it,https://edodoc.it,https://edodoc-sito.web.app,https://edodoc-sito.firebaseapp.com|LOGGING_FILE_NAME=|GOOGLE_SENZA_CHIAVE=true|APP_PROVA_DOTTORE_EMAIL=prova.dottore@edodoc.it|APP_PROVA_PAZIENTE_EMAIL=prova.paziente@edodoc.it|APP_PROVA_DOTTORE_PASSWORD=test|APP_PROVA_PAZIENTE_PASSWORD=test" \
      --update-secrets "DB_PASSWORD=edodoc-db-password:latest,JWT_SECRET=edodoc-jwt-secret:latest,ADMIN_PASSWORD=edodoc-admin-password:latest" \
      --quiet
)
[[ "$target" == "backend" ]] && exit 0
fi

api="$(gcloud run services describe edodoc-backend --region "$region" --format='value(status.url)')/api"

echo
echo "=== Frontend (Firebase Hosting) ==="
(
  cd "$root/edodoc-frontend"
  VITE_API_BASE_URL="$api" npm run build
  # La CLI preferisce il login salvato, anche se scaduto: un HOME vuoto la costringe a usare la chiave.
  firebase_home="$(mktemp -d)"
  trap 'rm -rf "$firebase_home"' EXIT
  HOME="$firebase_home" GOOGLE_APPLICATION_CREDENTIALS="$key" firebase deploy --only hosting --project "$project"
)

echo
echo "Deploy completato: $site"
