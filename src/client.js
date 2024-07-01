import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
    TransactionInstruction
} from '@solana/web3.js';
import { sha256 } from 'js-sha256';

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
    const statusMessage = document.getElementById("statusMessage");
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modal = document.getElementById('verifyModal');
    const closeButton = document.getElementsByClassName('close')[0];
    const verifyChecksumOption = document.getElementById('verifyChecksumOption');
    const verifyMediaOption = document.getElementById('verifyMediaOption');
    const checksumInputArea = document.getElementById('checksumInputArea');
    const mediaInputArea = document.getElementById('mediaInputArea');
    const verifyChecksumButton = document.getElementById('verifyChecksumButton');
    const verifyMediaButton = document.getElementById('verifyMediaButton');
    const checksumInput = document.getElementById('checksumInput');
    const publicKeyInput = document.getElementById('publicKeyInput');
    const mediaPublicKeyInput = document.getElementById('mediaPublicKeyInput');
    const mediaFileInput = document.getElementById('mediaFileInput');
    const mediaDropArea = document.getElementById('mediaDropArea');
    const mediaFileInfo = document.getElementById('mediaFileInfo');
    const verifyResult = document.getElementById('verifyResult');
    const fileInputArea = document.getElementById('fileInputArea');
    const dropArea = document.getElementById('drop-area');
    const fileElem = document.getElementById('fileElem');
    const fileInfo = document.getElementById('fileInfo');
    const mediaTypeSelect = document.getElementById('mediaTypeSelect');

    let provider = null;
    let connection = new Connection("https://api.testnet.solana.com", 'confirmed');
    let programId = new PublicKey("BDoTMxmU7DBHT8Q75nZdqJ228ZhDdWnQjsyvLtRy9VRx");
    let payer = null;
    let newAccount = Keypair.generate();
    let selectedFile = null;

    function showStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'red' : 'green';
    }

    function getProvider() {
        if ("solana" in window) {
            const provider = window.solana;
            if (provider.isPhantom) {
                return provider;
            }
        }
        window.open("https://phantom.app/", "_blank");
    }

    function showLoader() {
        document.getElementById('loader').style.display = 'block';
    }

    function hideLoader() {
        document.getElementById('loader').style.display = 'none';
    }

    function updateProgress(step) {
        const steps = document.querySelectorAll('.step');
        steps.forEach((s, index) => {
            if (index < step) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
    }

    function formatChecksum(checksum) {
        return checksum;
    }

    function calculateChecksum(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const binary = event.target.result;
                const checksum = sha256(binary);
                resolve(checksum);
            };
            reader.onerror = function(error) {
                reject(error);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async function createAccount() {
        createAccountButton.disabled = true;
        showLoader();
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
            console.log(`New account created. Write this key in a safe place, you will need it to check media checksums in the future. Public key: ${newAccount.publicKey.toBase58()}`);
            publicKeyDisplay.innerHTML = `New account created. Write this key in a safe place, you will need it to check media checksums in the future. Public key:<br><p style="color:red;">${newAccount.publicKey.toBase58()}</p>`;

            uploadChecksumButton.disabled = true;
            showStatus("Account created successfully! Please select a file to upload its checksum.");
            fileInputArea.style.display = 'block';
            updateProgress(2);
        } catch (err) {
            console.error("Failed to create account", err);
            showStatus("Failed to create account", true);
            createAccountButton.disabled = false;
        }
        hideLoader();
    }

    async function uploadChecksum() {
        if (!selectedFile) {
            showStatus('Please select a file first', true);
            return;
        }

        uploadChecksumButton.disabled = true;
        showLoader();

        try {
            const checksum = await calculateChecksum(selectedFile);
            const mediaType = selectedFile.type.startsWith('image/') ? 1 : 0;

            const checksumBytes = new Uint8Array(checksum.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

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

            const { blockhash } = await connection.getRecentBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = payer;

            const signedTransaction = await provider.signTransaction(transaction);
            const serializedTransaction = signedTransaction.serialize();
            const signature = await connection.sendRawTransaction(serializedTransaction);

            await connection.confirmTransaction(signature);
            console.log("Checksum uploaded successfully");
            showStatus("Checksum uploaded successfully!");
            updateProgress(3);
        } catch (err) {
            console.error("Failed to upload checksum", err);
            showStatus("Failed to upload checksum", true);
        }
        uploadChecksumButton.disabled = false;
        hideLoader();
    }

    async function publicVerifyChecksum(accountPubkey, checksum, mediaType) {
		showVerifyLoader();
		disableVerifyButtons();
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
                showVerifyResult("Account not found", true);
                hideLoader();
                return;
            }

            const media = Media.unpack(accountInfo.data);
            const isChecksumMatch = media.isInitialized && compareChecksums(media.checksum, checksumBytes) && media.mediaType === mediaType;

            if (isChecksumMatch) {
                console.log("Checksum verification successful");

                const signatures = await connection.getSignaturesForAddress(new PublicKey(accountPubkey));
                if (signatures.length === 0) {
                    console.log("No transactions found for this account");
                    showVerifyResult("No transactions found for this account", true);
                    hideLoader();
                    return;
                }

                const recentSignature = signatures[0].signature;
                const transactionDetails = await connection.getConfirmedTransaction(recentSignature);
                const transactionDateTime = new Date(transactionDetails.blockTime * 1000);

                console.log(`Media Type: ${media.mediaType}`);
                console.log(`Checksum Found: ${Buffer.from(media.checksum).toString('hex')}`);
                console.log(`Transaction Date and Time: ${transactionDateTime}`);
                showVerifyResult(
                    "Checksum verification successful!",
                    false,
                    media.mediaType,
                    Buffer.from(media.checksum).toString('hex'),
                    transactionDateTime
                );
            } else {
                console.log("Checksum verification failed");
                showVerifyResult("Checksum verification failed", true);
            }
        } catch (err) {
            console.error("Failed to verify checksum", err);
            showVerifyResult("Failed to verify checksum", true);
        }
        hideVerifyLoader();
		enableVerifyButtons();
    }

    function compareChecksums(storedChecksum, providedChecksum) {
        if (storedChecksum.length !== providedChecksum.length) return false;
        for (let i = 0; i < storedChecksum.length; i++) {
            if (storedChecksum[i] !== providedChecksum[i]) return false;
        }
        return true;
    }

    async function handleFiles(file) {
        selectedFile = file;
        fileInfo.textContent = `Selected file: ${file.name}`;
        uploadChecksumButton.disabled = true;
        showStatus("Calculating checksum...");
        
        try {
            const checksum = await calculateChecksum(file);
            console.log(`Calculated checksum: ${checksum}`);
            
            const formattedChecksum = formatChecksum(checksum);
            fileInfo.innerHTML = `
                Selected file: ${file.name}<br>
                Calculated checksum: <p style="color:red;">${formattedChecksum}</p>
            `;
            
            showStatus("Checksum calculated successfully!");
            uploadChecksumButton.disabled = false;
        } catch (error) {
            console.error('Error calculating checksum:', error);
            showStatus('Error calculating checksum', true);
            uploadChecksumButton.disabled = true;
        }
    }

    // Event Listeners
    connectWalletButton.onclick = async () => {
        provider = getProvider();
        if (!provider) return;

        try {
            showLoader();
            await provider.connect();
            payer = provider.publicKey;
            console.log("Connected with public key:", payer.toString());

            connectWalletButton.disabled = true;
            createAccountButton.disabled = false;
            showStatus("Wallet connected successfully!");
            updateProgress(1);
        } catch (err) {
            console.error("Failed to connect to Phantom wallet", err);
            showStatus("Failed to connect to Phantom wallet", true);
        }
        hideLoader();
    };

    createAccountButton.onclick = createAccount;
    uploadChecksumButton.onclick = uploadChecksum;

    publicVerifyChecksumButton.onclick = () => {
        modal.style.display = 'block';
    };

    closeButton.onclick = () => {
        modal.style.display = 'none';
        resetVerifyModal();
    };

    verifyChecksumOption.onclick = () => {
        checksumInputArea.style.display = 'block';
        mediaInputArea.style.display = 'none';
    };

    verifyMediaOption.onclick = () => {
        checksumInputArea.style.display = 'none';
        mediaInputArea.style.display = 'block';
    };

    verifyChecksumButton.onclick = async () => {
        const checksum = checksumInput.value;
        const publicKey = publicKeyInput.value;
        const mediaType = parseInt(mediaTypeSelect.value);
        if (!checksum || !publicKey) {
            showVerifyResult("Please enter both checksum and public key", true);
            return;
        }
        await publicVerifyChecksum(publicKey, checksum, mediaType);
    };

    verifyMediaButton.onclick = async () => {
        const file = mediaFileInput.files[0];
        const publicKey = mediaPublicKeyInput.value;
        if (!file || !publicKey) {
            showVerifyResult("Please select a file and enter the public key", true);
            return;
        }
        const checksum = await calculateChecksum(file);
        await publicVerifyChecksum(publicKey, checksum, getMediaType(file));
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
            resetVerifyModal();
        }
    };

    darkModeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
    });

    // File drag and drop functionality
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        mediaDropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
        mediaDropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
        mediaDropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        e.target.classList.add('highlight');
    }

    function unhighlight(e) {
        e.target.classList.remove('highlight');
    }

    dropArea.addEventListener('drop', handleDrop, false);
    mediaDropArea.addEventListener('drop', handleMediaDrop, false);

    async function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        await handleFiles(file);
    }

 async function handleMediaDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file) {
            handleMediaFileSelect(file);
        }
    }

    fileElem.addEventListener('change', async function() {
        await handleFiles(this.files[0]);
    });

    mediaFileInput.addEventListener('change', function() {
        handleMediaFileSelect(this.files[0]);
    });

    function handleMediaFileSelect(file) {
        if (file) {
            mediaFileInfo.textContent = `Selected file: ${file.name}`;
            
            // Create a new FileList object
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            mediaFileInput.files = dataTransfer.files;
        }
    }

    function resetVerifyModal() {
        checksumInput.value = '';
        publicKeyInput.value = '';
        mediaPublicKeyInput.value = '';
        mediaFileInput.value = '';
        mediaFileInfo.textContent = '';
        verifyResult.textContent = '';
        checksumInputArea.style.display = 'none';
        mediaInputArea.style.display = 'none';
    }

function showVerifyResult(message, isError = false, mediaType = null, checksum = null, transactionDateTime = null) {
    verifyResult.innerHTML = `<div class="verify-result ${isError ? 'error' : 'success'}">
        <h3><i class="fas ${isError ? 'fa-times-circle' : 'fa-check-circle'}"></i> ${message}</h3>
    </div>`;
    
    if (!isError && mediaType !== null && checksum !== null && transactionDateTime !== null) {
        verifyResult.innerHTML += `
            <div class="verify-details">
                <p><i class="fas ${mediaType === 1 ? 'fa-image' : 'fa-video'}"></i> <strong>Media Type:</strong> ${mediaType === 1 ? 'Image' : 'Video'}</p>
                <p><i class="fas fa-fingerprint"></i> <strong>Checksum Found:</strong> <span class="checksum">${checksum}</span></p>
                <p><i class="far fa-clock"></i> <strong>Transaction Date and Time:</strong> ${transactionDateTime}</p>
            </div>
        `;
    }
}

    function getMediaType(file) {
        return file.type.startsWith('image/') ? 1 : 0; // 1 for image, 0 for video
    }
	
	
	
function showVerifyLoader() {
    document.getElementById('verifyLoader').style.display = 'block';
}

function hideVerifyLoader() {
    document.getElementById('verifyLoader').style.display = 'none';
}

function disableVerifyButtons() {
    verifyChecksumButton.disabled = true;
    verifyMediaButton.disabled = true;
}

function enableVerifyButtons() {
    verifyChecksumButton.disabled = false;
    verifyMediaButton.disabled = false;
}	
	
	
	
});