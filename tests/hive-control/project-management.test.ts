console.warn = () => { }; // Suppresses console.warn from web3.js

import * as web3 from "@solana/web3.js";
import {
  BadgesCondition,
  HiveControlPermissionInput,
  Project,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  client,
  connection,
  sendTransaction,
  userKeypair,
} from "../../utils";

describe("Hive Control Projects with Subsidy", () => {
  let project: Project;

  it("Creates/Loads Project", async () => {
    const {
      createCreateProjectTransaction: {
        project: projectAddress,
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

    project = await client
      .findProjects({ addresses: [projectAddress] })
      .then((res) => res.project[0]);
    expect(project).toBeTruthy();

    if (project.subsidyFees) {
      const tx = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: adminKeypair.publicKey,
          toPubkey: new web3.PublicKey(projectAddress),
          lamports: 1_000_000_000,
        })
      );
      tx.feePayer = adminKeypair.publicKey;

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.sign(adminKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
    }
  });

  it("Change Project Driver", async () => {
    const { createChangeProjectDriverTransaction: txResponse } =
      await client.createChangeProjectDriverTransaction({
        project: project.address,
        driver: userKeypair.publicKey.toString(),
        authority: adminKeypair.publicKey.toString(),
      });
    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createChangeProjectDriverTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.driver).toBe(userKeypair.publicKey.toString());
  });

  it("Create Project Delegate Authority", async () => {
    const { createCreateDelegateAuthorityTransaction: txResponse } =
      await client.createCreateDelegateAuthorityTransaction({
        project: project.address,
        delegate: userKeypair.publicKey.toString(),
        serviceDelegations: {
          HiveControl: [
            {
              permission: HiveControlPermissionInput.ManageServices,
            },
          ],
        },
        authority: adminKeypair.publicKey.toString(),
      });
    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createCreateDelegateAuthorityTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.authority).toBe(adminKeypair.publicKey.toString());
  });

  it("Modify Project Delegate Authority", async () => {
    const { createModifyDelegationTransaction: txResponse } =
      await client.createModifyDelegationTransaction({
        project: project.address,
        delegate: userKeypair.publicKey.toString(),
        modifyDelegation: {
          delegation: {
            HiveControl: {
              permission: HiveControlPermissionInput.ManageServices,
            },
          },
        },
        authority: adminKeypair.publicKey.toString(),
      });
    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createModifyDelegationTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.authority).toBe(adminKeypair.publicKey.toString());
  });

  it("Creates/Loads Badge Criteria", async () => {
    const { createInitializeBadgeCriteriaTransaction: txResponse } =
      await client.createInitializeBadgeCriteriaTransaction({
        args: {
          authority: adminKeypair.publicKey.toString(),
          projectAddress: project.address,
          endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
          startTime: Math.floor(Date.now() / 1000),
          badgeIndex: 0,
          payer: adminKeypair.publicKey.toString(),
          condition: BadgesCondition.Public,
        },
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createInitializeBadgeCriteriaTransaction"
    );

    project = await client
      .findProjects({ addresses: [project.address] })
      .then((res) => res.project[0]);
    expect(project.badgeCriteria?.[0]).toBeTruthy();
  });

  it("Update Badge Criteria", async () => {
    const { createUpdateBadgeCriteriaTransaction: txResponse } =
      await client.createUpdateBadgeCriteriaTransaction({
        args: {
          authority: adminKeypair.publicKey.toString(),
          condition: BadgesCondition.Public,
          criteriaIndex: 0,
          projectAddress: project.address,
          endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
          payer: adminKeypair.publicKey.toString(),
          startTime: Math.floor(Date.now() / 1000),
        },
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUpdateBadgeCriteriaTransaction"
    );

    project = await client
      .findProjects({ addresses: [project.address] })
      .then((res) => res.project[0]);
    expect(project.badgeCriteria?.[0]).toBeTruthy();
  });
});
