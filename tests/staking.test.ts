import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import * as web3 from "@solana/web3.js";
import base58 from "bs58";
import fs from "fs";
import path from "path";
import { createNewTree, mintOneCNFT } from "../utils";
import { Client, fetchExchange } from "@urql/core";
import {
    HplCurrency,
    PermissionedCurrencyKind,
} from "@honeycomb-protocol/currency-manager";
import {
    Honeycomb,
    HoneycombProject,
    identityModule,
} from "@honeycomb-protocol/hive-control";
import createEdgeClient, {
    CharacterModel,
    LockTypeEnum,
    Transaction,
    Transactions,
} from "@honeycomb-protocol/edge-client";
import { fetchHeliusAssets } from "@honeycomb-protocol/character-manager";

jest.setTimeout(200000);

require("dotenv").config();

const API_URL = process.env.API_URL ?? "http://localhost:4000/";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8899/";
const DAS_API_URL = process.env.DAS_API_URL ?? RPC_URL;

const totalNfts = 5;
const totalcNfts = 0;

const connection = new web3.Connection(RPC_URL, "processed");

const client = createEdgeClient(
    new Client({
        url: API_URL,
        exchanges: [fetchExchange],
    })
);

const adminKeypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(
            fs.readFileSync(path.resolve(__dirname, "keys", "admin.json"), "utf8")
        )
    )
);

const userKeypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(
            fs.readFileSync(path.resolve(__dirname, "keys", "user.json"), "utf8")
        )
    )
);

const sendTransaction = async (
    txResponse: Transaction,
    signer: web3.Keypair,
    action: string
) => {
    const signedTx = web3.VersionedTransaction.deserialize(
        base58.decode(txResponse.transaction)
    );
    signedTx.sign([signer]);

    const { sendBulkTransactions } = await client.sendBulkTransactions({
        txs: [base58.encode(signedTx.serialize())],
        blockhash: txResponse!.blockhash,
        lastValidBlockHeight: txResponse!.lastValidBlockHeight,
        options: {
            skipPreflight: true,
        },
    });

    expect(sendBulkTransactions.length).toBe(1);
    if (sendBulkTransactions[0].status !== "Success") {
        console.log(
            action,
            sendBulkTransactions[0].status,
            sendBulkTransactions[0].signature,
            sendBulkTransactions[0].error
        );
    }
    expect(sendBulkTransactions[0].status).toBe("Success");
};

const sendTransactions = async (
    txResponse: Transactions,
    signer: web3.Keypair,
    action: string
) => {
    const txs = txResponse!.transactions.map((txStr) => {
        const tx = web3.VersionedTransaction.deserialize(base58.decode(txStr));
        tx.sign([signer]);
        return base58.encode(tx.serialize());
    });

    const { sendBulkTransactions } = await client.sendBulkTransactions({
        txs,
        blockhash: txResponse!.blockhash,
        lastValidBlockHeight: txResponse!.lastValidBlockHeight,
        options: {
            skipPreflight: true,
        },
    });

    expect(sendBulkTransactions.length).toBe(txs.length);
    sendBulkTransactions.forEach((txResponse) => {
        if (txResponse.status !== "Success") {
            console.log(action, txResponse.signature, txResponse.error);
        }
        expect(txResponse.status).toBe("Success");
    });
};

describe("Test Nectar Staking Txs", () => {
    let collection: web3.PublicKey;
    let merkleTree: web3.PublicKey;
    let projectAddress: web3.PublicKey;
    let project: HoneycombProject;
    let currencyAddress: web3.PublicKey;
    let stakingPoolAddress: web3.PublicKey;
    let currency: HplCurrency;
    let characterModelAddress: web3.PublicKey;
    let characterModel: CharacterModel;
    let multipliersAddress: string;

    beforeAll(async () => {
        const adminHC = new Honeycomb(connection).use(identityModule(adminKeypair));
        const metaplex = new Metaplex(connection);
        metaplex.use(keypairIdentity(adminKeypair));

        // Mint Collection
        if (!collection && (totalNfts > 0 || totalcNfts > 0)) {
            collection = await metaplex
                .nfts()
                .create({
                    name: "Collection",
                    symbol: "COL",
                    sellerFeeBasisPoints: 0,
                    uri: "https://api.eboy.dev/",
                    isCollection: true,
                    collectionIsSized: true,
                })
                .then((x) => x.nft.mint.address);
        }
        console.log("Collection", collection.toString());

        // Mint Nfts
        for (let i = 1; i <= totalNfts; i++) {
            await metaplex
                .nfts()
                .create({
                    name: `Sol Patrol #${i}`,
                    symbol: `NFT`,
                    sellerFeeBasisPoints: 100,
                    uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
                    collection,
                    collectionAuthority: metaplex.identity(),
                    tokenStandard: TokenStandard.NonFungible,
                    tokenOwner: userKeypair.publicKey,
                })
                .then((x) => x.nft);
        }

        // Mint cNFTs
        for (let i = 1; i <= totalcNfts; i++) {
            if (i === 1 && !merkleTree) {
                [merkleTree] = await createNewTree(connection, adminKeypair);
            }

            await mintOneCNFT(connection, adminKeypair, {
                dropWalletKey: userKeypair.publicKey,
                name: `cNFT #${i}`,
                symbol: "cNFT",
                uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
                merkleTree,
                collectionMint: collection,
            });
        }

        // Create Project
        if (!projectAddress) {
            project = await HoneycombProject.new(adminHC, {
                name: "Project",
            });
        } else {
            project = await HoneycombProject.fromAddress(adminHC, projectAddress);
        }
        adminHC.use(project);
        projectAddress = project.address;
        console.log("Project", projectAddress.toString());

        // Create Currency
        if (!currencyAddress) {
            currency = await HplCurrency.new(adminHC, {
                name: "BAIL",
                symbol: "BAIL",
                kind: PermissionedCurrencyKind.NonCustodial,
                decimals: 9,
                uri: "https://arweave.net/1VxSzPEOwYlTo3lU5XSQWj-9Ldt3dB68cynDDjzeF-c",
            });
            currencyAddress = currency.address;
        } else {
            currency = await HplCurrency.fromAddress(adminHC, currencyAddress);
        }
        console.log("Currency", currencyAddress.toString());

        // Create Holder Account
        adminHC.use(currency);
        await currency.newHolderAccount(userKeypair.publicKey);

        // Create Character Model
        if (!characterModelAddress) {
            const {
                createCreateCharacterModelTransaction: {
                    tx: txResponse,
                    characterModel: characterModelAddressT,
                },
            } = await client.createCreateCharacterModelTransaction({
                config: {
                    kind: "Wrapped",
                    criterias: [
                        {
                            kind: "Collection",
                            params: collection.toString(),
                        },
                        ...(merkleTree
                            ? [
                                {
                                    kind: "MerkleTree",
                                    params: merkleTree.toString(),
                                },
                            ]
                            : []),
                    ],
                },
                project: projectAddress.toString(),
                authority: adminKeypair.publicKey.toString(),
                payer: adminKeypair.publicKey.toString(),
            });
            characterModelAddress = new web3.PublicKey(characterModelAddressT);

            await sendTransaction(
                txResponse,
                adminKeypair,
                "createCreateCharacterModelTransaction"
            );
        }
        console.log("Character Model", characterModelAddress.toString());

        await new Promise((resolve) => setTimeout(resolve, 10000));
        characterModel = await client
            .findCharacterModels({
                ids: [characterModelAddress.toString()],
            })
            .then((res) => res.characterModel[0]);
        expect(characterModel).toBeTruthy();

        // Create Characters Tree
        if (
            !characterModel.merkle_trees.merkle_trees[
            characterModel.merkle_trees.active
            ]
        ) {
            const { createCreateCharactersTreeTransaction: txResponse } =
                await client.createCreateCharactersTreeTransaction({
                    treeConfig: {
                        maxDepth: 3,
                        maxBufferSize: 8,
                        canopyDepth: 3,
                    },
                    project: projectAddress.toString(),
                    characterModel: characterModelAddress.toString(),
                    authority: adminKeypair.publicKey.toString(),
                    payer: adminKeypair.publicKey.toString(),
                });

            await sendTransaction(
                txResponse,
                adminKeypair,
                "createCreateCharactersTreeTransaction"
            );

            await new Promise((resolve) => setTimeout(resolve, 10000));
            characterModel = await client
                .findCharacterModels({
                    ids: [characterModelAddress.toString()],
                })
                .then((res) => res.characterModel[0]);
        }

        // Wrap Assets
        const assets = await fetchHeliusAssets(DAS_API_URL, {
            walletAddress: userKeypair.publicKey,
            collectionAddress: collection,
        }).then((assets) => assets.filter((n) => !n.frozen).slice(0, 5));

        if (!assets.length) throw new Error("No Assets to wrap");

        const { createWrapAssetsToCharacterTransactions: txResponse } =
            await client.createWrapAssetsToCharacterTransactions({
                project: projectAddress.toString(),
                characterModel: characterModelAddress.toString(),
                activeCharactersMerkleTree:
                    characterModel.merkle_trees.merkle_trees[
                        characterModel.merkle_trees.active
                    ].toString(),
                wallet: userKeypair.publicKey.toString(),
                mintList: assets.map((n) => n.mint.toString()),
            });

        const txs = txResponse!.transactions.map((txStr) => {
            const tx = web3.VersionedTransaction.deserialize(base58.decode(txStr));
            tx.sign([userKeypair]);
            return base58.encode(tx.serialize());
        });

        await sendTransactions(
            txResponse,
            userKeypair,
            "createWrapAssetsToCharacterTransactions"
        );
    });

    it("Create/Load Staking Pool", async () => {
        if (!projectAddress) throw new Error("Project not created");
        if (!currencyAddress) throw new Error("Currency not created");

        if (!stakingPoolAddress) {
            const {
                createCreateStakingPoolTransaction: {
                    tx: stakingPoolTx,
                    stakingPoolAddress: stakingPoolAddressT,
                },
            } = await client.createCreateStakingPoolTransaction({
                project: projectAddress.toString(),
                currency: currencyAddress.toString(),
                authority: adminKeypair.publicKey.toString(),
                metadata: {
                    name: "Staking",
                    rewardsPerDuration: 1,
                    rewardsDuration: "1",
                    maxRewardsDuration: null,
                    minStakeDuration: null,
                    cooldownDuration: null,
                    resetStakeDuration: false,
                    startTime: Date.now().toString(),
                    endTime: null,
                    lockType: LockTypeEnum.Freeze,
                },
            });

            stakingPoolAddress = new web3.PublicKey(stakingPoolAddressT);
            console.log("Staking Pool", stakingPoolAddressT.toString());
            await sendTransaction(
                stakingPoolTx,
                adminKeypair,
                "createCreateStakingPoolTransaction"
            );
        }

        const pool = await client
            .findStakingPools({
                ids: [stakingPoolAddress.toBase58()],
            })
            .then((res) => res.stakingPools[0]);

        expect(pool).toBeTruthy();
    });

    it("Update Staking Pool", async () => {
        if (!stakingPoolAddress) throw new Error("Staking Pool not created");

        const { createUpdateStakingPoolTransaction: updatePoolTx } =
            await client.createUpdateStakingPoolTransaction({
                authority: adminKeypair.publicKey.toString(),
                project: projectAddress.toString(),
                stakingPool: stakingPoolAddress.toString(),
                metadata: {},
            });

        await sendTransaction(
            updatePoolTx,
            adminKeypair,
            "createUpdateStakingPoolTransaction"
        );

        const stakingPool = await client
            .findStakingPools({
                ids: [stakingPoolAddress.toString()],
            })
            .then((res) => res.stakingPools[0]);

        expect(stakingPool).toBeTruthy();
    });

    it("Create/Load Multipliers", async () => {
        if (!projectAddress) throw new Error("Project not created");
        if (!stakingPoolAddress) throw new Error("Staking Pool not created");

        if (!multipliersAddress) {
            const {
                createInitMultipliersTransaction: {
                    multipliersAddress: multipliersAddressT,
                    tx: initMultiplierTx,
                },
            } = await client.createInitMultipliersTransaction({
                authority: adminKeypair.publicKey.toString(),
                project: projectAddress.toString(),
                stakingPool: stakingPoolAddress.toString(),
                decimals: 3,
            });

            await sendTransaction(
                initMultiplierTx,
                adminKeypair,
                "createInitMultipliersTransaction"
            );

            multipliersAddress = multipliersAddressT;
            console.log("Multipliers", multipliersAddress);
        }

        const multipliers = await client
            .findMultipliers({
                ids: [multipliersAddress],
            })
            .then((res) => res.multipliers[0]);

        expect(multipliers).toBeTruthy();
    });

    it("Add Multiplier", async () => {
        if (!projectAddress) throw new Error("Project not created");
        if (!stakingPoolAddress) throw new Error("Staking Pool not created");
        if (!multipliersAddress) throw new Error("Multipliers not created");

        const { createAddMultiplierTransaction: txResponse } =
            await client.createAddMultiplierTransaction({
                project: projectAddress.toString(),
                multiplier: multipliersAddress,
                authority: adminKeypair.publicKey.toString(),
                metadata: {
                    value: 200, // +0.2x (i.e. 1.2x if 1x)
                    type: {
                        minStakeDuration: "3600", // 1 hour
                    },
                },
            });

        await sendTransaction(
            txResponse,
            adminKeypair,
            "createAddMultiplierTransaction"
        );

        const multipliers = await client
            .findMultipliers({
                ids: [multipliersAddress],
            })
            .then((res) => res.multipliers[0]);

        expect(multipliers).toBeTruthy();
    });

    it("Stake Characters", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const { character } = await client.findCharacters({
            filters: {
                owner: userKeypair.publicKey.toString(),
                usedBy: {
                    kind: "None",
                },
            },
            trees: characterModel.merkle_trees.merkle_trees.map((x) => x.toString()),
        });

        if (!character?.length) throw new Error("No characters to stake");

        const { createStakeCharactersTransactions: txResponse } =
            await client.createStakeCharactersTransactions({
                characterIds: character.map((x) => x!.id),
                project: projectAddress.toString(),
                characterModel: characterModelAddress.toString(),
                stakingPool: stakingPoolAddress.toString(),
                feePayer: userKeypair.publicKey.toString(),
            });

        await sendTransactions(
            txResponse,
            userKeypair,
            "createStakeCharactersTransactions"
        );

        await new Promise((resolve) => setTimeout(resolve, 10000));
        const { character: characterRefetch } = await client.findCharacters({
            ids: character.map((x) => x!.id),
        });
        expect(characterRefetch.length).toBe(character.length);
        characterRefetch.forEach((x) => {
            expect(x.usedBy.kind).toBe("Staking");
        });
    });

    it("Unstake Character", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const { character } = await client.findCharacters({
            filters: {
                owner: userKeypair.publicKey.toString(),
                usedBy: {
                    kind: "Staking",
                },
            },
            trees: characterModel.merkle_trees.merkle_trees.map((x) => x.toString()),
        });

        if (!character?.length) throw new Error("No characters to unstake");

        const { createUnstakeCharactersTransactions: txResponse } =
            await client.createUnstakeCharactersTransactions({
                characterIds: character.map((x) => x!.id),
                characterModel: characterModelAddress.toString(),
                feePayer: userKeypair.publicKey.toString(),
            });

        await sendTransactions(
            txResponse,
            userKeypair,
            "createUnstakeCharactersTransactions"
        );

        await new Promise((resolve) => setTimeout(resolve, 10000));
        const { character: characterRefetch } = await client.findCharacters({
            ids: character.map((x) => x!.id),
        });
        expect(characterRefetch.length).toBe(character.length);
        characterRefetch.forEach((x) => {
            expect(x.usedBy.kind).toBe("None");
        });
    });
});
