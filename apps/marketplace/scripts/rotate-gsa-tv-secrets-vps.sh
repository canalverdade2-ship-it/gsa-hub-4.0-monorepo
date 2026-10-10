#!/bin/bash
set -euo pipefail

echo "Iniciando rotação de segredos GSA TV (Autopilot V2)..."

if [ "$EUID" -ne 0 ]; then
  echo "Por favor, execute este script como root (sudo)."
  exit 1
fi

ENV_PATH="/opt/gsa-tv/control-plane/.env"
ENCODER_STATE="/opt/gsa-tv/runtime/encoder-state.json"

if [ ! -f "$ENV_PATH" ]; then
    echo "Aviso: $ENV_PATH não existe. Criando novo arquivo seguro..."
    mkdir -p $(dirname "$ENV_PATH")
    touch "$ENV_PATH"
fi

# Gerar novos tokens fortes
NEW_CONTROL_TOKEN=$(openssl rand -hex 32)
NEW_ENCODER_TOKEN=$(openssl rand -hex 32)

# Substituir ou adicionar tokens no .env
if grep -q "GSA_TV_CONTROL_TOKEN=" "$ENV_PATH"; then
    sed -i "s/^GSA_TV_CONTROL_TOKEN=.*/GSA_TV_CONTROL_TOKEN=$NEW_CONTROL_TOKEN/" "$ENV_PATH"
else
    echo "GSA_TV_CONTROL_TOKEN=$NEW_CONTROL_TOKEN" >> "$ENV_PATH"
fi

if grep -q "GSA_TV_ENCODER_TOKEN=" "$ENV_PATH"; then
    sed -i "s/^GSA_TV_ENCODER_TOKEN=.*/GSA_TV_ENCODER_TOKEN=$NEW_ENCODER_TOKEN/" "$ENV_PATH"
else
    echo "GSA_TV_ENCODER_TOKEN=$NEW_ENCODER_TOKEN" >> "$ENV_PATH"
fi

# Ajustar permissões para garantir segurança
chown root:root "$ENV_PATH"
chmod 600 "$ENV_PATH"

echo "Segredos rotacionados com sucesso no .env."

echo "Removendo estado persistido antigo do Encoder Engine (caso exista)..."
if [ -f "$ENCODER_STATE" ]; then
    rm -f "$ENCODER_STATE"
    echo "Estado persistido removido."
fi

echo "Para aplicar a rotação, recrie o Control Plane e o Encoder Engine usando os novos tokens:"
echo "docker restart gsa-tv-control-plane"
echo "docker restart gsa-tv-encoder-engine"

echo "Rotação concluída."
