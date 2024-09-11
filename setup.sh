#!/bin/bash

ENV_FILE=".env"

install_solana_cli() {
    if ! command -v solana &> /dev/null; then
        echo "Solana CLI not found. Installing..."
        sh -c "$(curl -sSfL https://release.solana.com/v1.18.18/install)"
    else
        echo "Solana CLI already installed."
    fi
}

install_deps() {
    echo "Installing dependencies..."
    read -p "Do you want to install Solana CLI? (y/n): " install_solana
    if [ "$install_solana" == "y" ]; then
        install_solana_cli
    fi

    read -p "Do you use yarn or npm for package management? (1 for Yarn, 2 for NPM, type anything else to cancel): " package_manager
    if [ "$package_manager" == "1" ]; then
        if ! command -v yarn &> /dev/null; then
            echo "Yarn not found. Installing..."
            npm install -g yarn
        else
            echo "Yarn already installed."
        fi
        yarn install
    elif [ "$package_manager" == "2" ]; then
        npm install
    else
        echo "Skipping package installation."
    fi
}

add_env_variable() {
    VAR_NAME=$1
    VAR_VALUE=$2

    if ! grep -q "^${VAR_NAME}=" "$ENV_FILE"; then
        echo "Adding ${VAR_NAME} to .env..."
        echo "${VAR_NAME}=${VAR_VALUE}" >> "$ENV_FILE"
    else
        echo "${VAR_NAME} already exists in .env."
    fi
}


generate_keypair() {
    local key_file=$1
    if [ -f "$key_file" ]; then
        read -p "$key_file already exists. Do you want to overwrite it? (y/n): " overwrite
        if [ "$overwrite" != "y" ]; then
            echo "Skipping $key_file keypair generation."
            return
        fi
    fi
    echo "Generating $key_file keypair..."
    solana-keygen new --outfile "$key_file" --no-bip39-passphrase --force
}

install_deps

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch "$ENV_FILE"
else
    echo ".env file already exists. Checking if the required variables are present..."
fi
add_env_variable "API_URL" \"https://edge.test.honeycombprotocol.com/\"
add_env_variable "RPC_URL" \"https://rpc.test.honeycombprotocol.com/\"
add_env_variable "DAS_API_URL" \"https://rpc.test.honeycombprotocol.com/\"
add_env_variable "DEBUG_LOGS" false
add_env_variable "ERROR_LOGS" true

export $(grep -v '^#' "$ENV_FILE" | xargs)

if [ ! -d "keys" ]; then
    echo "Creating the keys directory..."
    mkdir keys
else
    echo "keys directory already exists."
fi

echo "Generating admin keypair..."
generate_keypair "keys/admin.json"

echo "Generating user keypair..."
generate_keypair "keys/user.json"

echo "Airdropping SOL to admin..."
solana airdrop 1000 --url $RPC_URL -k ./keys/admin.json
echo "Honeynet SOL airdropped to admin."

echo "Airdropping SOL to user..."
solana airdrop 1000 --url $RPC_URL -k ./keys/user.json
echo "Honeynet SOL airdropped to user."

echo "Script completed. Happy testing!"