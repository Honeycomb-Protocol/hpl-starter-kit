import * as web3 from "@solana/web3.js";
import {
  AddSplMultiplierMetadataInput,
  SplStakingPool,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  client,
  connection,
  log,
  sendTransaction,
  userKeypair,
  wait,
} from "../utils";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe("Test SPL Staking Txs", () => {
  let merkleTree: web3.PublicKey;
  let projectAddress: string;
  let stakingPoolAddress: string;
  let stakeTokenMint: string;
  let mintToUser: Boolean = true;
  let rewardTokenMint: string;
  let mintToAdmin: Boolean = true;
  let splStakingPool: SplStakingPool;
  let stakingReciept1: string;

  beforeAll(async () => {
    // Mint a SPL token to stake
    if (!stakeTokenMint) {
      const tokenMint = await createMint(
        connection,
        adminKeypair,
        adminKeypair.publicKey,
        adminKeypair.publicKey,
        9
      );
      stakeTokenMint = tokenMint.toString();
      console.log("Stake Token Mint: ", stakeTokenMint);
    }

    if (mintToUser) {
      const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userKeypair,
        new web3.PublicKey(stakeTokenMint),
        userKeypair.publicKey,
        false
      );

      const transactionSignature = await mintTo(
        connection,
        adminKeypair,
        new web3.PublicKey(stakeTokenMint),
        associatedTokenAccount.address,
        adminKeypair,
        10000 * 10 ** 9
      );

      log("Minted Tokens", transactionSignature);
    }

    // Create Project
    if (!projectAddress) {
      const {
        createCreateProjectTransaction: {
          project: projectAddressT,
          tx: txResponse,
        },
      } = await client.createCreateProjectTransaction({
        name: "Test Project",
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateProjectTransaction"
      );

      projectAddress = projectAddressT;
    }
    log("Project", projectAddress);
  });

  it("Create/Load Staking Pool", async () => {
    if (!stakingPoolAddress) {
      const {
        createCreateSplStakingPoolTransaction: {
          tx: stakingPoolTxns,
          splStakingPoolAddress: stakingPoolAddressT,
        },
      } = await client.createCreateSplStakingPoolTransaction({
        project: projectAddress,
        stakeTokenMint: stakeTokenMint,
        payer: adminKeypair.publicKey.toString(),
        multipliers: [],
        authority: adminKeypair.publicKey.toString(),
        metadata: {
          name: "Staking",
          minStakeDurationSecs: "10",
          maxStakeDurationSecs: "60",
        },
      });

      stakingPoolAddress = stakingPoolAddressT;
      log("Staking Pool", stakingPoolAddress);

      await sendTransaction(
        {
          blockhash: stakingPoolTxns.blockhash,
          lastValidBlockHeight: stakingPoolTxns.lastValidBlockHeight,
          transaction: stakingPoolTxns.transaction,
        },
        [adminKeypair],
        "createCreateStakingPoolTransaction"
      );

      const pool = await client
        .findSplStakingPools({
          addresses: [stakingPoolAddress],
        })
        .then((res) => res.splStakingPools[0]);

      splStakingPool = pool;

      expect(pool).toBeTruthy();
    } else {
      splStakingPool = await client
        .findSplStakingPools({
          addresses: [stakingPoolAddress],
        })
        .then((res) => res.splStakingPools[0]);
    }

    if (
      !splStakingPool.merkleTrees.merkle_trees[
        splStakingPool.merkleTrees.active
      ]
    ) {
      const {
        createCreateNewSplStakingPoolTreeTransaction: {
          treeAddress: treeAddressT,
          tx: tx,
        },
      } = await client.createCreateNewSplStakingPoolTreeTransaction({
        treeConfig: {
          advanced: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 3,
          },
        },
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        tx,
        [adminKeypair],
        "createCreateStakingRecieptsTreeTransaction"
      );

      merkleTree = new web3.PublicKey(treeAddressT);

      const pool = await client
        .findSplStakingPools({
          addresses: [stakingPoolAddress],
        })
        .then((res) => res.splStakingPools[0]);

      expect(pool.merkleTrees.merkle_trees[pool.merkleTrees.active]).toBe(
        merkleTree.toString()
      );
      splStakingPool = pool;
      await wait(30);
      log("Merkle Tree", merkleTree.toString());
    }
  });

  it("Add Spl Multipliers", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const multipliersMetadata: AddSplMultiplierMetadataInput[] = [
      {
        value: "1700",
        type: {
          minAmount: (10 * 10 ** 9).toString(),
        },
      },
      {
        value: "2000",
        type: {
          minAmount: (10 * 10 ** 9).toString(),
        },
      },
    ];

    const { createAddRemoveSplMultipliersTransaction: txResponse } =
      await client.createAddRemoveSplMultipliersTransaction({
        project: projectAddress,
        authority: adminKeypair.publicKey.toString(),
        add: multipliersMetadata,
        splStakingPool: stakingPoolAddress,
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createAddSplMultipliersTransaction"
    );

    await wait(30);
    const pool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.splStakingPools[0]);

    expect(pool.multipliers.length).toBeGreaterThan(0);
  });

  it("Remove Spl Multipliers", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const { createAddRemoveSplMultipliersTransaction: txResponse } =
      await client.createAddRemoveSplMultipliersTransaction({
        project: projectAddress,
        authority: adminKeypair.publicKey.toString(),
        remove: [0],
        splStakingPool: stakingPoolAddress,
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createRemoveSplMultipliersTransaction"
    );

    const pool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.splStakingPools[0]);

    expect(pool.multipliers.length).toBe(1);
  });

  it("Stake Tokens", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(11 * 10 ** 9),
        lockPeriodSecs: "10",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    await wait(60);

    const { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });
    log("active multipliers", splStakingRecipients[0].multiplier);
    expect(splStakingRecipients.length > 0).toBeTruthy();
    expect(splStakingRecipients[0].multiplier).toBe(2000);
  });

  it("Create Reward pool", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    if (!rewardTokenMint) {
      const tokenMint = await createMint(
        connection,
        adminKeypair,
        adminKeypair.publicKey,
        adminKeypair.publicKey,
        9
      );
      rewardTokenMint = tokenMint.toString();
      console.log("Reward Token Mint", rewardTokenMint);
    }

    if (mintToAdmin) {
      const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        adminKeypair,
        new web3.PublicKey(rewardTokenMint),
        adminKeypair.publicKey,
        false
      );

      const transactionSignature = await mintTo(
        connection,
        adminKeypair,
        new web3.PublicKey(rewardTokenMint),
        associatedTokenAccount.address,
        adminKeypair,
        10000 * 10 ** 9
      );
      console.log("associatedTokenAccount", associatedTokenAccount.toString());
      log("Minted Tokens", transactionSignature);
    }

    const { createSplRewardPoolTransaction: txResponse } =
      await client.createSplRewardPoolTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        rewardConfig: {
          ApyConfig: {
            rewardsDuration: "10",
            rewardsPerDuration: (10 * 10 ** 9).toString(),
          },
        },
        rewardTokenMint: rewardTokenMint,
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createAddSplRewardsTransaction"
    );

    const pool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.splStakingPools[0]);

    expect(pool).toBeTruthy();

    splStakingPool = pool;
  });

  it("Add Spl Rewards from pool", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const { createAddRemoveRewardsFromRewardPoolTransaction: txResponse } =
      await client.createAddRemoveRewardsFromRewardPoolTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        rewardTokenMint: rewardTokenMint,
        action: {
          add: (10000 * 10 ** 9).toString(),
        },
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createAddRewardsToRewardPoolTransaction"
    );

    const pool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.splStakingPools[0]);

    expect(pool).toBeTruthy();

    splStakingPool = pool;
  });

  it("Remove Spl Rewards from pool", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const { createAddRemoveRewardsFromRewardPoolTransaction: txResponse } =
      await client.createAddRemoveRewardsFromRewardPoolTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        rewardTokenMint: rewardTokenMint,
        action: {
          remove: (1000 * 10 ** 9).toString(),
        },
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createRemoveRewardsFromRewardPoolTransaction"
    );

    const pool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.splStakingPools[0]);

    expect(pool).toBeTruthy();

    splStakingPool = pool;
  });

  it("Claim SPL Rewards", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");

    const { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });

    stakingReciept1 = splStakingRecipients[0].address;
    const { createClaimSplRewardsTransaction: txResponse } =
      await client.createClaimSplRewardsTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        stakingReciept: splStakingRecipients[0].address,
        staker: userKeypair.publicKey.toString(),
        payer: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    const rewardTokenInfo = await connection.getAccountInfo(
      new web3.PublicKey(rewardTokenMint)
    );

    const recieverTokenAccount = getAssociatedTokenAddressSync(
      new web3.PublicKey(rewardTokenMint),
      userKeypair.publicKey,
      false,
      rewardTokenInfo?.owner
    );

    const recieverTokenAccountInfo = await connection.getTokenAccountBalance(
      recieverTokenAccount
    );

    expect(Number(recieverTokenAccountInfo.value.amount)).toBeGreaterThan(0);
  });

  it("Unstake Tokens", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");
    const { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });

    const { createUnstakeSplTokensTransaction: txResponse } =
      await client.createUnstakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        stakingReciept: splStakingRecipients[0].address,
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    const stakeTokenInfo = await connection.getAccountInfo(
      new web3.PublicKey(stakeTokenMint)
    );

    const recieverTokenAccount = getAssociatedTokenAddressSync(
      new web3.PublicKey(stakeTokenMint),
      userKeypair.publicKey,
      false,
      stakeTokenInfo?.owner
    );

    const recieverTokenAccountInfo = await connection.getTokenAccountBalance(
      recieverTokenAccount
    );

    expect(Number(recieverTokenAccountInfo.value.amount)).toBe(10000 * 10 ** 9);
  });

  it("Update Spl Staking Pool", async () => {
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const { createUpdateSplStakingPoolTransaction: updatePoolTx } =
      await client.createUpdateSplStakingPoolTransaction({
        authority: adminKeypair.publicKey.toString(),
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        metadata: {
          name: "Updated Staking Pool",
          minStakeDurationSecs: "5",
          maxStakeDurationSecs: "60",
          startTime: (Date.now() / 1000 + 60).toFixed(0).toString(),
          endTime: (Date.now() / 1000 + 240).toFixed(0).toString(),
        },
        payer: adminKeypair.publicKey.toString(),
      });

    const tx = await sendTransaction(
      updatePoolTx,
      [adminKeypair],
      "createUpdateStakingPoolTransaction"
    );

    log("Updated Staking Pool", tx.signature);

    const stakingPool = await client
      .findSplStakingPools({
        addresses: [stakingPoolAddress.toString()],
      })
      .then((res) => res.splStakingPools[0]);

    expect(stakingPool.name).toBe("Updated Staking Pool");
    expect(Number(stakingPool.startTime)).toBeGreaterThan(0);
  });

  it("Stake Tokens before start time - (expect tx to fail)", async () => {
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(1000 * 10 ** 9),
        lockPeriodSecs: "10",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    const response = await sendTransaction(
      txResponse,
      [userKeypair],
      "Stake Tokens before start time",
      { expectFail: true }
    );

    expect(response.error.InstructionError[1]).toHaveProperty ("Custom", 6015);
  });

  it("Stake Tokens after start time", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");
    await wait(60);
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(1000 * 10 ** 9),
        lockPeriodSecs: "10",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "Stake Tokens after start time"
    );

    await wait(60);

    const { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });
    expect(splStakingRecipients.length > 0).toBeTruthy();
  });

  it("Stake Tokens below min stake duration - (expect tx to fail)", async () => {
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(1000 * 10 ** 9),
        lockPeriodSecs: "1",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    const response = await sendTransaction(
      txResponse,
      [userKeypair],
      "Stake Tokens below min stake duration",
      { expectFail: true }
    );

    expect(response.error.InstructionError[1]).toHaveProperty("Custom", 6017);
  });

  it("Stake Tokens above max stake duration - (expect tx to fail)", async () => {
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(1000 * 10 ** 9),
        lockPeriodSecs: "1000000000",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    const response = await sendTransaction(
      txResponse,
      [userKeypair],
      "Stake Tokens above max stake duration",
      { expectFail: true }
    );

    expect(response.error.InstructionError[1]).toHaveProperty ("Custom", 6018);
  });

  it("Stake Tokens after stake time ends - (expect tx to fail)", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");
    await wait(120);
    const { createStakeSplTokensTransaction: txResponse } =
      await client.createStakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        amount: String(1000 * 10 ** 9),
        lockPeriodSecs: "10",
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    const response = await sendTransaction(
      txResponse,
      [userKeypair],
      "Stake Tokens after stake time ends",
      { expectFail: true }
    );

    expect(response.error.InstructionError[1]).toHaveProperty ("Custom", 6016);
  });

  it("Claim SPL Rewards", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");

    let { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });
    splStakingRecipients = splStakingRecipients.filter(
      (s) => s.address !== stakingReciept1
    );

    const { createClaimSplRewardsTransaction: txResponse } =
      await client.createClaimSplRewardsTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        stakingReciept: splStakingRecipients[0].address,
        staker: userKeypair.publicKey.toString(),
        payer: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    const rewardTokenInfo = await connection.getAccountInfo(
      new web3.PublicKey(rewardTokenMint)
    );

    const recieverTokenAccount = getAssociatedTokenAddressSync(
      new web3.PublicKey(rewardTokenMint),
      userKeypair.publicKey,
      false,
      rewardTokenInfo?.owner
    );

    const recieverTokenAccountInfo = await connection.getTokenAccountBalance(
      recieverTokenAccount
    );

    expect(Number(recieverTokenAccountInfo.value.amount)).toBeGreaterThan(0);
  });

  it("Unstake Tokens", async () => {
    if (!splStakingPool) throw new Error("Staking Pool not found");
    const { splStakingRecipients } = await client.findSplStakingRecipients({
      stakers: [userKeypair.publicKey.toString()],
      splStakingPools: [stakingPoolAddress],
    });

    const { createUnstakeSplTokensTransaction: txResponse } =
      await client.createUnstakeSplTokensTransaction({
        project: projectAddress,
        splStakingPool: stakingPoolAddress,
        stakingReciept: splStakingRecipients[0].address,
        payer: userKeypair.publicKey.toString(),
        staker: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    const stakeTokenInfo = await connection.getAccountInfo(
      new web3.PublicKey(stakeTokenMint)
    );

    const recieverTokenAccount = getAssociatedTokenAddressSync(
      new web3.PublicKey(stakeTokenMint),
      userKeypair.publicKey,
      false,
      stakeTokenInfo?.owner
    );

    const recieverTokenAccountInfo = await connection.getTokenAccountBalance(
      recieverTokenAccount
    );

    expect(Number(recieverTokenAccountInfo.value.amount)).toBe(10000 * 10 ** 9);
  });
});
