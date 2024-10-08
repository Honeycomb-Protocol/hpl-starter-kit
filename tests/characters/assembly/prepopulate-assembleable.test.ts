import {
    AssemblerConfig,
    Character,
    CharacterModel,
    MintAsKind,
    Project,
  } from "@honeycomb-protocol/edge-client";
  import {
    adminKeypair,
    AssetResponse,
    client,
    connection,
    createAssemblerConfig,
    createCharacterModelRaw,
    createProject,
    mintAssets,
    sendTransaction,
    sendTransactions,
    umi,
    userKeypair,
    wait,
} from "../../../utils";
import { order, traits } from "./traits";

const refetchCharacter = async (
    characterModel: CharacterModel,
    shoudldWait = true
  ) => {
    shoudldWait && (await wait(2));
    const character = await client
      .findCharacters({
        trees: [
          characterModel.merkle_trees.merkle_trees[
            characterModel.merkle_trees.active
          ],
        ],
        wallets: [userKeypair.publicKey.toString()],
      })
      .then((res) => res.character[0] as Character);
  
    expect(character).toBeTruthy();
    return character;
  };

const totalMplCoreNfts = 1;
const totalNfts = 1;
const totalcNfts = 1;
const totalExtensionsNft = 0;

describe("Test Assembled Character Minting as different assets", () => {
    let assets: AssetResponse = {};
    let project: Project;

    const populateWrapAndUnwrap = async (
      assemblerConfig: AssemblerConfig,
      characterModel: CharacterModel,
      mint: string
    ) => {
      const { createPopulateCharacterTransaction } =
        await client.createPopulateCharacterTransaction({
          attributes: [
            ["Fur", "Black"],
            ["Eyes", "2 Tone"],
            ["Mouth", "Agitated"],
            ["Clothes", "Astronaut"],
          ],
          project: project.address,
          assemblerConfig: assemblerConfig.address,
          characterModel: characterModel.address,
          mint,
          updateAuthority: adminKeypair.publicKey.toString(),
          owner: userKeypair.publicKey.toString(),
          payer: adminKeypair.publicKey.toString(),
        });
  
      await sendTransaction(
        createPopulateCharacterTransaction,
        [adminKeypair],
        "createPopulateCharacterTransaction"
      );
  
      const preWrapBalance = await connection.getBalance(userKeypair.publicKey);
  
      let character = await refetchCharacter(characterModel);
      expect(character.usedBy.kind).toBe("Ejected");
  
      const { createWrapAssetsToCharacterTransactions: txResponse } =
        await client.createWrapAssetsToCharacterTransactions({
          project: project.address,
          characterModel: characterModel.address,
          wallet: userKeypair.publicKey.toString(),
          mintList: [mint],
        });
  
      await sendTransactions(
        txResponse,
        [userKeypair],
        "createWrapAssetsToCharacterTransactions"
      );
  
      const postWrapBalance = await connection.getBalance(userKeypair.publicKey);
      // expect(preWrapBalance).toBe(postWrapBalance);
  
      character = await refetchCharacter(characterModel);
      expect(character.usedBy.kind).toBe("None");
  
      const { createUnwrapAssetsFromCharacterTransactions } =
        await client.createUnwrapAssetsFromCharacterTransactions({
          characterAddresses: [character.address],
          project: project.address,
          characterModel: characterModel.address,
          wallet: userKeypair.publicKey.toString(),
        });
  
      await sendTransactions(
        createUnwrapAssetsFromCharacterTransactions,
        [userKeypair],
        "createUnwrapAssetsFromCharacterTransactions",
      );

      character = await refetchCharacter(characterModel);
      expect(character.usedBy.kind).toBe("Ejected");
  
      return character;
    };
  
    beforeAll(async () => {
      assets = await mintAssets(
        umi,
        {
          cnfts: totalcNfts,
          core: totalMplCoreNfts,
          pnfts: totalNfts,
          token22: totalExtensionsNft,
        },
        userKeypair.publicKey
      );
  
      project = await createProject(
        undefined,
        undefined,
        undefined,
        false,
        false,
        false
      );
    });
  
    it("Prepolute MplCore Asset as character", async () => {
      if (!assets.core?.mints.length) return;
  
      const assemblerConfig = await createAssemblerConfig(project, order, traits);
  
      // dirLog(assemblerConfig);
  
      const characterModel = await createCharacterModelRaw(
        project,
        {
          kind: "Assembled",
          assemblerConfigInput: {
            assemblerConfig: assemblerConfig.address,
            name: "Character #0",
            symbol: "CHR",
            description: "Creating this character with honeycomb",
            creators: [
              {
                address: adminKeypair.publicKey.toString(),
                share: 100,
              },
            ],
            sellerFeeBasisPoints: 0,
            collectionName: "Collection",
          },
        },
        {
          maxDepth: 3,
          maxBufferSize: 8,
          canopyDepth: 3,
        },
        {
          kind: MintAsKind.MplCore,
        }
      );
  
      const preBalance = await connection.getBalance(userKeypair.publicKey);
  
      await populateWrapAndUnwrap(
        assemblerConfig,
        characterModel,
        assets.core.mints[0]
      );
  
      const postBalance = await connection.getBalance(userKeypair.publicKey);
      // expect(preBalance).toBe(postBalance);
    });
  
    it("Prepolute MplMetadata Asset as character", async () => {
      if (!assets.pnfts?.mints.length) return;
  
      const assemblerConfig = await createAssemblerConfig(project, order, traits);
  
      const characterModel = await createCharacterModelRaw(
        project,
        {
          kind: "Assembled",
          assemblerConfigInput: {
            assemblerConfig: assemblerConfig.address,
            name: "Character #0",
            symbol: "CHR",
            description: "Creating this character with honeycomb",
            creators: [
              {
                address: adminKeypair.publicKey.toString(),
                share: 100,
              },
            ],
            sellerFeeBasisPoints: 0,
            collectionName: "Collection",
          },
        },
        {
          maxDepth: 3,
          maxBufferSize: 8,
          canopyDepth: 3,
        },
        {
          kind: MintAsKind.MplMetadata,
        }
      );
  
      const preBalance = await connection.getBalance(userKeypair.publicKey);
  
      await populateWrapAndUnwrap(
        assemblerConfig,
        characterModel,
        assets.pnfts.mints[0]
      );
  
      const postBalance = await connection.getBalance(userKeypair.publicKey);
      // expect(preBalance).toBe(postBalance);
    });
  
    it("Prepolute MplBubblegum Asset as character", async () => {
      if (!assets.cnfts?.mints.length) return;
  
      const assemblerConfig = await createAssemblerConfig(project, order, traits);
  
      const characterModel = await createCharacterModelRaw(
        project,
        {
          kind: "Assembled",
          assemblerConfigInput: {
            assemblerConfig: assemblerConfig.address,
            name: "Character #0",
            symbol: "CHR",
            description: "Creating this character with honeycomb",
            creators: [
              {
                address: adminKeypair.publicKey.toString(),
                share: 100,
              },
            ],
            sellerFeeBasisPoints: 0,
            collectionName: "Collection",
          },
        },
        {
          maxDepth: 3,
          maxBufferSize: 8,
          canopyDepth: 3,
        },
        {
          kind: MintAsKind.MplBubblegum,
          mplBubblegum: {
            maxDepth: 3,
            maxBufferSize: 8,
          },
        }
      );
  
      const preBalance = await connection.getBalance(userKeypair.publicKey);
  
      await populateWrapAndUnwrap(
        assemblerConfig,
        characterModel,
        assets.cnfts.mints[0].mint.toString()
      );
  
      const postBalance = await connection.getBalance(userKeypair.publicKey);
      // expect(preBalance).toBe(postBalance);
    });
  });
