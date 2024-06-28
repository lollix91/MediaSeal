use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub struct Media {
    pub is_initialized: bool,
    pub checksum: [u8; 32],
    pub media_type: u8,
}

impl Sealed for Media {}

impl IsInitialized for Media {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for Media {
    const LEN: usize = 34;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, Media::LEN];
        let (is_initialized_dst, checksum_dst, media_type_dst) = mut_array_refs![dst, 1, 32, 1];
        is_initialized_dst[0] = self.is_initialized as u8;
        checksum_dst.copy_from_slice(&self.checksum);
        media_type_dst[0] = self.media_type;
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, Media::LEN];
        let (is_initialized, checksum, media_type) = array_refs![src, 1, 32, 1];
        Ok(Media {
            is_initialized: is_initialized[0] != 0,
            checksum: *checksum,
            media_type: media_type[0],
        })
    }
}

fn media_type_to_string(media_type: u8) -> &'static str {
    match media_type {
        0 => "Video",
        1 => "Photo",
        _ => "Other",
    }
}

fn checksum_to_hex_string(checksum: &[u8]) -> String {
    checksum
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let account = next_account_info(&mut accounts.iter())?;

    if account.owner != program_id {
        msg!("Program is not owned by you.");
        return Err(ProgramError::IncorrectProgramId);
    }

    if instruction_data.len() < Media::LEN {
        msg!("Instruction data too short: {}", instruction_data.len());
        return Err(ProgramError::InvalidInstructionData);
    }

    let instruction_type = instruction_data[0];
    let checksum = &instruction_data[1..33];
    let media_type = instruction_data[33];

    match instruction_type {
        0 => {
            msg!("Saving media checksum for future validation.");
            let mut media = Media::unpack_unchecked(&account.data.borrow())?;
            media.is_initialized = true;
            media.checksum.copy_from_slice(checksum);
            media.media_type = media_type;

            Media::pack(media, &mut account.data.borrow_mut())?;

            msg!(
                "Saved media checksum. Media type: {} SHA-256 Checksum: {}",
                media_type_to_string(media_type),
                checksum_to_hex_string(checksum)
            );
        }
        1 => {
            msg!("Verifying media checksum.");
            let media = Media::unpack_unchecked(&account.data.borrow())?;
            if media.is_initialized && media.checksum == *checksum && media.media_type == media_type
            {
                msg!(
                    "Checksum verification SUCCESSFUL. Media type: {} SHA-256 Checksum: {}",
                    media_type_to_string(media_type),
                    checksum_to_hex_string(checksum)
                );
                return Ok(());
            } else {
                msg!(
                    "Checksum verification FAILED. Media type: {} SHA-256 Checksum: {}",
                    media_type_to_string(media.media_type),
                    checksum_to_hex_string(checksum)
                );
                return Err(ProgramError::InvalidArgument);
            }
        }
        _ => {
            msg!("Invalid instruction type");
            return Err(ProgramError::InvalidInstructionData);
        }
    }

    Ok(())
}
