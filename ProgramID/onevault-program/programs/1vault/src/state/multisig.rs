use anchor_lang::prelude::*;

use crate::constants::MAX_MULTISIG_MEMBERS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum UpgradeProposalStatus {
    Pending,
    Approved,
    Executed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct UpgradeMultisig {
    pub initialized_by: Pubkey,
    /// Squads / external multisig that holds Solana program upgrade authority (optional).
    pub squads_multisig: Pubkey,
    pub member_count: u8,
    pub members: [Pubkey; MAX_MULTISIG_MEMBERS],
    pub threshold: u8,
    pub next_proposal_id: u64,
    pub bump: u8,
}

impl UpgradeMultisig {
    pub fn is_member(&self, key: &Pubkey) -> Option<usize> {
        self.members[..self.member_count as usize]
            .iter()
            .position(|m| m == key)
    }

    pub fn has_approved(&self, proposal_mask: u8, member_index: usize) -> bool {
        (proposal_mask & (1u8 << member_index)) != 0
    }

    pub fn set_approved(mask: u8, member_index: usize) -> u8 {
        mask | (1u8 << member_index)
    }

    pub fn approval_count(mask: u8, member_count: u8) -> u8 {
        (0..member_count).filter(|i| (mask & (1u8 << i)) != 0).count() as u8
    }
}

#[account]
#[derive(InitSpace)]
pub struct UpgradeProposal {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    /// Program buffer account that will receive the new .so bytecode.
    pub program_buffer: Pubkey,
    #[max_len(32)]
    pub version_label: String,
    pub approval_mask: u8,
    pub approval_count: u8,
    pub status: UpgradeProposalStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}
