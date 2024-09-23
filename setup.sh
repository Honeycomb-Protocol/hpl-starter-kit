#!/bin/bash

ENV_FILE=".env"
SOLS_TO_AIRDROP=1000

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

    read -p "Do you use yarn, npm, or bun for package management? (1 for Yarn, 2 for NPM, 3 for Bun, type anything else to skip dependency installation): " package_manager
    if [ "$package_manager" == "1" ]; then
        if ! command -v yarn &> /dev/null; then
            echo "Yarn not found. Installing..."
            npm install -g yarn@1.22.22
            rm ./package-lock.json
        else
            echo "Yarn already installed."
        fi
        yarn install
        yarn global add ts-node
        rm ./package-lock.json
        rm ./bun.lockb
    elif [ "$package_manager" == "2" ]; then
        npm install --legacy-peer-deps
        npm install -g ts-node
        rm ./yarn.lock
        rm ./bun.lockb
    elif [ "$package_manager" == "3" ]; then
        if ! command -v bun &> /dev/null; then
            echo "Bun not found. Installing..."
            curl -fsSL https://bun.sh/install | bash
            export BUN_INSTALL="$HOME/.bun"
            export PATH=$BUN_INSTALL/bin:$PATH
        else
            echo "Bun already installed."
        fi
        bun install
        rm ./yarn.lock
        rm ./package-lock.json
    else
        echo "Skipping dependency installation."
    fi
}

add_env_variable() {
    VAR_NAME=$1
    VAR_VALUE=$2

    if grep -q "^${VAR_NAME}=" "$ENV_FILE"; then
        echo "Replacing ${VAR_NAME} in .env..."
        sed -i "/^${VAR_NAME}=/c\\${VAR_NAME}=${VAR_VALUE}" "$ENV_FILE"
    else
        echo "Adding ${VAR_NAME} to .env..."
        echo "${VAR_NAME}=${VAR_VALUE}" >> "$ENV_FILE"
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

airdrop() {
    local keypair=$1
    local amount=$2
    echo "Airdropping $amount SOL to $keypair..."
    solana airdrop $amount --url $RPC_URL -k $keypair
    echo "$amount SOL airdropped to $keypair."
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

airdrop "keys/admin.json" $SOLS_TO_AIRDROP
airdrop "keys/user.json" $SOLS_TO_AIRDROP

echo "Setup completed. Happy testing!"