import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction,
    TransactionInstruction
} from '@solana/web3.js';

class Media {
    constructor(isInitialized, checksum, mediaType) {
        this.isInitialized = isInitialized;
        this.checksum = checksum;
        this.mediaType = mediaType;
    }

    static unpack(data) {
        const isInitialized = data[0] !== 0;
        const checksum = data.slice(1, 33);
        const mediaType = data[33];
        return new Media(isInitialized, checksum, mediaType);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const connectWalletButton = document.getElementById("connectWallet");
    const createAccountButton = document.getElementById("createAccount");
    const uploadChecksumButton = document.getElementById("uploadChecksum");
    const publicVerifyChecksumButton = document.getElementById("publicVerifyChecksum");
    const publicKeyDisplay = document.getElementById("publicKeyDisplay");

    let provider = null;
    let connection = new Connection("https://api.testnet.solana.com", 'confirmed');
    let programId = new PublicKey("BDoTMxmU7DBHT8Q75nZdqJ228ZhDdWnQjsyvLtRy9VRx");
    let payer = null;
    let newAccount = Keypair.generate();

    function getProvider() {
        if ("solana" in window) {
            const provider = window.solana;
            if (provider.isPhantom) {
                return provider;
            }
        }
        window.open("https://phantom.app/", "_blank");
    }

    connectWalletButton.onclick = async () => {
        provider = getProvider();
        if (!provider) return;

        try {
            await provider.connect();
            payer = provider.publicKey;
            console.log("Connected with public key:", payer.toString());

            connectWalletButton.disabled = true;
            createAccountButton.disabled = false;
        } catch (err) {
            console.error("Failed to connect to Phantom wallet", err);
        }
    };

    async function createAccount() {
        const lamports = await connection.getMinimumBalanceForRentExemption(34);

        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer,
                newAccountPubkey: newAccount.publicKey,
                lamports,
                space: 34,
                programId,
            })
        );

        try {
            const { blockhash } = await connection.getRecentBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = payer;

            const signedTransaction = await provider.signTransaction(transaction);
            signedTransaction.partialSign(newAccount);

            const serializedTransaction = signedTransaction.serialize();
            const signature = await connection.sendRawTransaction(serializedTransaction);

            await connection.confirmTransaction(signature);
            console.log(`New account created with public key: ${newAccount.publicKey.toBase58()}`);
            publicKeyDisplay.textContent = `New Account Public Key: ${newAccount.publicKey.toBase58()}`;

            createAccountButton.disabled = true;
            uploadChecksumButton.disabled = false;
        } catch (err) {
            console.error("Failed to create account", err);
        }
    }

    async function uploadChecksum(checksum, mediaType) {
        let checksumBytes;
        if (typeof checksum === 'string') {
            if (checksum.length !== 64) {
                throw new Error("Checksum string length must be 64 characters");
            }
            checksumBytes = new Uint8Array(checksum.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        } else if (checksum.length === 32) {
            checksumBytes = checksum;
        } else {
            throw new Error("Checksum must be a 32-byte array or a 64-character hex string");
        }

        const instructionData = new Uint8Array([0, ...checksumBytes, mediaType]);
        const paymentAmount = 1000000;

        const transaction = new Transaction().add(
            new TransactionInstruction({
                keys: [
                    { pubkey: newAccount.publicKey, isSigner: false, isWritable: true },
                ],
                programId,
                data: instructionData,
            }),
            SystemProgram.transfer({
                fromPubkey: payer,
                toPubkey: new PublicKey("GbCtp2K9E39sXLKfTyWUGMRgWbyh8XFPwaKx54aZyECc"),
                lamports: paymentAmount,
            })
        );

        try {
            const { blockhash } = await connection.getRecentBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = payer;

            uploadChecksumButton.disabled = true;
            const signedTransaction = await provider.signTransaction(transaction);
            const serializedTransaction = signedTransaction.serialize();
            const signature = await connection.sendRawTransaction(serializedTransaction);

            await connection.confirmTransaction(signature);
            console.log("Checksum uploaded successfully");
            uploadChecksumButton.disabled = false;
        } catch (err) {
            console.error("Failed to upload checksum", err);
            uploadChecksumButton.disabled = false;
        }
    }

    async function publicVerifyChecksum(accountPubkey, checksum, mediaType) {
        let checksumBytes;
        if (typeof checksum === 'string') {
            if (checksum.length !== 64) {
                throw new Error("Checksum string length must be 64 characters");
            }
            checksumBytes = new Uint8Array(checksum.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        } else if (checksum.length === 32) {
            checksumBytes = checksum;
        } else {
            throw new Error("Checksum must be a 32-byte array or a 64-character hex string");
        }

        try {
            const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
            if (accountInfo === null) {
                console.log("Account not found");
                return;
            }

            const media = Media.unpack(accountInfo.data);
            const isChecksumMatch = media.isInitialized && compareChecksums(media.checksum, checksumBytes) && media.mediaType === mediaType;

            if (isChecksumMatch) {
                console.log("Checksum verification successful");

                const signatures = await connection.getSignaturesForAddress(new PublicKey(accountPubkey));
                if (signatures.length === 0) {
                    console.log("No transactions found for this account");
                    return;
                }

                const recentSignature = signatures[0].signature;
                const transactionDetails = await connection.getConfirmedTransaction(recentSignature);
                const transactionDateTime = new Date(transactionDetails.blockTime * 1000);

                console.log(`Media Type: ${media.mediaType}`);
                console.log(`Checksum Found: ${Buffer.from(media.checksum).toString('hex')}`);
                console.log(`Transaction Date and Time: ${transactionDateTime}`);
            } else {
                console.log("Checksum verification failed");
            }
        } catch (err) {
            console.error("Failed to verify checksum", err);
        }
    }

    function compareChecksums(storedChecksum, providedChecksum) {
        if (storedChecksum.length !== providedChecksum.length) return false;
        for (let i = 0; i < storedChecksum.length; i++) {
            if (storedChecksum[i] !== providedChecksum[i]) return false;
        }
        return true;
    }

    createAccountButton.onclick = createAccount;
    uploadChecksumButton.onclick = async () => {
        const checksum = "8a9f17b09aa5c3baa1bba66ffa0ad3c5e56ecebefac0b14e0b5abffa8b473ef5";
        const mediaType = 1;

        await uploadChecksum(checksum, mediaType);
    };
    publicVerifyChecksumButton.onclick = async () => {
        const accountPubkey = prompt("Enter the account public key to verify:");
        const checksum = "8a9f17b09aa5c3baa1bba66ffa0ad3c5e56ecebefac0b14e0b5abffa8b473ef5";
        const mediaType = 1;

        await publicVerifyChecksum(accountPubkey, checksum, mediaType);
    };
});
