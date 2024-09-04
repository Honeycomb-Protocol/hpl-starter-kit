#!/bin/bash

ENV_FILE=".env"

add_env_variable() {
    VAR_NAME=$1
    VAR_VALUE=$2
    if ! grep -q "^${VAR_NAME}=" "$ENV_FILE"; then
        echo "Adding ${VAR_NAME} to .env..."
        echo "${VAR_NAME}=\"${VAR_VALUE}\"" >> "$ENV_FILE"
    else
        echo "${VAR_NAME} already exists in .env."
    fi
}

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch .env
    echo "API_URL=\"https://edge.test.honeycombprotocol.com/\"" >> "$ENV_FILE"
    echo "RPC_URL=\"https://rpc.test.honeycombprotocol.com/\"" >> "$ENV_FILE"
    echo "DAS_API_URL=\"https://edge.test.honeycombprotocol.com/\"" >> "$ENV_FILE"
else
    echo ".env file already exists."

    add_env_variable "API_URL" "https://edge.test.honeycombprotocol.com/"
    add_env_variable "RPC_URL" "https://rpc.test.honeycombprotocol.com/"
    add_env_variable "DAS_API_URL" "https://edge.test.honeycombprotocol.com/"
fi

echo "Waiting for the .env file to be created..."
while [ ! -f "$ENV_FILE" ]; do
    sleep 1
done

export $(grep -v '^#' "$ENV_FILE" | xargs)

if [ ! -d "keys" ]; then
    echo "Creating the keys directory..."
    mkdir keys
else
    echo "keys directory already exists."
fi

echo "Generating admin keypair..."
solana-keygen new --outfile keys/admin.json --no-bip39-passphrase --force

echo "Generating user keypair..."
solana-keygen new --outfile keys/user.json --no-bip39-passphrase --force

echo "Airdropping 100 SOL to admin..."
solana airdrop 100 --url $RPC_URL -k ./keys/admin.json

echo "Airdropping 100 SOL to user..."
solana airdrop 100 --url $RPC_URL -k ./keys/user.json

echo "Script completed. You can start running the tests now."