import {
    Currency,
    HolderStatusEnum,
    PermissionedCurrencyKindEnum,
    Project,
} from "@honeycomb-protocol/edge-client";
import {
    adminKeypair,
    client,
    sendTransaction,
    userKeypair,
    log,
} from "../utils";

describe("Currency Manager", () => {
    let projectAddress: string;
    let currencyAddress: string;
    let project: Project;
    let currency: Currency;

    it("Creates/Loads Project", async () => {
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
            log("projectAddress", projectAddress);
        }
        project = await client
            .findProjects({ addresses: [projectAddress] })
            .then((res) => res.project[0]);
        expect(project).toBeTruthy();
    });

    it("Init Currency", async () => {
        if (!project) throw new Error("Project not found");

        if (!currencyAddress) {
            log("Creating currency");
            const {
                createInitCurrencyTransaction: { currency: currencyAddressT, tx },
            } = await client.createInitCurrencyTransaction({
                create: {
                    authority: adminKeypair.publicKey.toString(),
                    project: project.address,
                    metadata: {
                        decimals: 9,
                        name: "Test Currency",
                        symbol: "TST",
                        uri: "https://qgp7lco5ylyitscysc2c7clhpxipw6sexpc2eij7g5rq3pnkcx2q.arweave.net/gZ_1id3C8InIWJC0L4lnfdD7ekS7xaIhPzdjDb2qFfU",
                        kind: PermissionedCurrencyKindEnum.Custodial,
                    },
                },
            });

            const response = await sendTransaction(
                tx,
                [adminKeypair],
                "createInitCurrencyTransaction"
            );
            expect(response.status).toBe("Success");
            log("currencyAddress", currencyAddressT);
            currencyAddress = currencyAddressT;
        }

        currency = await client
            .findCurrencies({
                addresses: [currencyAddress],
            })
            .then((e) => e.currencies[0]);

        expect(currency).toBeTruthy();
    });

    it("Create holder account", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const holderAccountFetched = await client
            .findHolderAccounts({
                owners: [userKeypair.publicKey.toString()],
                currencies: [currencyAddress],
            })
            .then((e) => e.holderAccounts[0]);

        if (!holderAccountFetched) {
            const {
                createCreateHolderAccountTransaction: { holderAccount, tx },
            } = await client.createCreateHolderAccountTransaction({
                project: projectAddress,
                currency: currencyAddress,
                owner: userKeypair.publicKey.toString(),
                payer: userKeypair.publicKey.toString(),
            });

            const response = await sendTransaction(
                tx,
                [userKeypair],
                "createCreateHolderAccountTransaction"
            );
            expect(response.status).toBe("Success");

            log("holderAccount", holderAccount);

            const holderAccountFetched = await client
                .findHolderAccounts({
                    owners: [userKeypair.publicKey.toString()],
                    currencies: [currencyAddress],
                })
                .then((e) => e.holderAccounts[0]);

            expect(holderAccountFetched).toBeTruthy();
        } else {
            expect(holderAccountFetched).toBeTruthy();
        }
    });

    it("Holder Account Status", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createSetHolderStatusTransaction } =
            await client.createSetHolderStatusTransaction({
                project: projectAddress,
                currency: currencyAddress,
                status: HolderStatusEnum.Active,
                owner: userKeypair.publicKey.toString(),
                payer: userKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            createSetHolderStatusTransaction,
            [userKeypair],
            "createSetHolderStatusTransaction"
        );
        expect(response.status).toBe("Success");

        const holderAccount = await client
            .findHolderAccounts({
                owners: [userKeypair.publicKey.toString()],
                currencies: [currencyAddress],
            })
            .then((e) => e.holderAccounts[0]);

        expect(holderAccount).toBeTruthy();
        expect(holderAccount.status).toBe("Active");
    });

    it("Mint Currencies", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createMintCurrencyTransaction: tx } =
            await client.createMintCurrencyTransaction({
                project: projectAddress,
                currency: currencyAddress,
                amount: "1000",
                mintTo: userKeypair.publicKey.toString(),
                authority: adminKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            tx,
            [adminKeypair],
            "createMintCurrencyTransaction"
        );
        expect(response.status).toBe("Success");

        expect(true).toBe(true);
    });

    it("Burn Currencies", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createBurnCurrencyTransaction } =
            await client.createBurnCurrencyTransaction({
                project: projectAddress,
                currency: currencyAddress,
                amount: "100",
                authority: userKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            createBurnCurrencyTransaction,
            [userKeypair],
            "createBurnCurrencyTransaction"
        );
        expect(response.status).toBe("Success");
    });

    it("Transfer Currencies", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createTransferCurrencyTransaction } =
            await client.createTransferCurrencyTransaction({
                project: projectAddress,
                currency: currencyAddress,
                amount: "100",
                receiver: adminKeypair.publicKey.toString(),
                sender: userKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            createTransferCurrencyTransaction,
            [userKeypair],
            "createTransferCurrencyTransaction"
        );
        expect(response.status).toBe("Success");

        const holderAccount = await client
            .findHolderAccounts({
                owners: [adminKeypair.publicKey.toString()],
                currencies: [currencyAddress],
            })
            .then((e) => e.holderAccounts[0]);

        expect(holderAccount).toBeTruthy();
    });

    it("Approve Delegation", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createApproveCurrencyDelegateTransaction } =
            await client.createApproveCurrencyDelegateTransaction({
                project: projectAddress,
                currency: currencyAddress,
                amount: "500",
                delegate: userKeypair.publicKey.toString(),
                owner: adminKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            createApproveCurrencyDelegateTransaction,
            [adminKeypair],
            "createApproveCurrencyDelegateTransaction"
        );
        expect(response.status).toBe("Success");
    });

    it("Revoke Delegation", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!currencyAddress) throw new Error("Currency not found");

        const { createRevokeCurrencyDelegateTransaction } =
            await client.createRevokeCurrencyDelegateTransaction({
                project: projectAddress,
                currency: currencyAddress,
                authority: adminKeypair.publicKey.toString(),
            });

        const response = await sendTransaction(
            createRevokeCurrencyDelegateTransaction,
            [adminKeypair],
            "createRevokeCurrencyDelegateTransaction"
        );
        expect(response.status).toBe("Success");
    });
});
