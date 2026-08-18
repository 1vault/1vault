use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::OneVaultError;
use crate::events::{
    UpgradeProposalApproved, UpgradeProposalCancelled, UpgradeProposalCreated,
    UpgradeProposalExecuted, UpgradeProposalReady,
};
use crate::state::{ProtocolConfig, UpgradeMultisig, UpgradeProposal, UpgradeProposalStatus};

#[derive(Accounts)]
pub struct InitializeUpgradeMultisig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + UpgradeMultisig::INIT_SPACE,
        seeds = [UPGRADE_MULTISIG_SEED],
        bump,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_upgrade_multisig(
    ctx: Context<InitializeUpgradeMultisig>,
    members: Vec<Pubkey>,
    threshold: u8,
    squads_multisig: Pubkey,
) -> Result<()> {
    require!(
        !members.is_empty() && members.len() <= MAX_MULTISIG_MEMBERS,
        OneVaultError::InvalidMultisigConfig
    );
    require!(
        threshold > 0 && threshold as usize <= members.len(),
        OneVaultError::InvalidMultisigConfig
    );

    let mut unique = members.clone();
    unique.sort();
    unique.dedup();
    require!(unique.len() == members.len(), OneVaultError::DuplicateMultisigMember);

    let ms = &mut ctx.accounts.upgrade_multisig;
    ms.initialized_by = ctx.accounts.authority.key();
    ms.squads_multisig = squads_multisig;
    ms.member_count = members.len() as u8;
    ms.members = [Pubkey::default(); MAX_MULTISIG_MEMBERS];
    for (i, m) in members.iter().enumerate() {
        ms.members[i] = *m;
    }
    ms.threshold = threshold;
    ms.next_proposal_id = 1;
    ms.bump = ctx.bumps.upgrade_multisig;

    let config = &mut ctx.accounts.protocol_config;
    config.upgrade_multisig = ms.key();
    config.multisig_enabled = true;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateUpgradeMultisig<'info> {
    pub member: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.multisig_enabled @ OneVaultError::MultisigNotEnabled,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [UPGRADE_MULTISIG_SEED],
        bump = upgrade_multisig.bump,
        constraint = upgrade_multisig.key() == protocol_config.upgrade_multisig @ OneVaultError::InvalidMultisig,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,
}

pub fn handle_update_upgrade_multisig(
    ctx: Context<UpdateUpgradeMultisig>,
    members: Vec<Pubkey>,
    threshold: u8,
    squads_multisig: Option<Pubkey>,
) -> Result<()> {
    require!(
        ctx.accounts.upgrade_multisig.is_member(&ctx.accounts.member.key()).is_some(),
        OneVaultError::NotMultisigMember
    );
    require!(
        !members.is_empty() && members.len() <= MAX_MULTISIG_MEMBERS,
        OneVaultError::InvalidMultisigConfig
    );
    require!(
        threshold > 0 && threshold as usize <= members.len(),
        OneVaultError::InvalidMultisigConfig
    );

    let ms = &mut ctx.accounts.upgrade_multisig;
    ms.member_count = members.len() as u8;
    ms.members = [Pubkey::default(); MAX_MULTISIG_MEMBERS];
    for (i, m) in members.iter().enumerate() {
        ms.members[i] = *m;
    }
    ms.threshold = threshold;
    if let Some(sq) = squads_multisig {
        ms.squads_multisig = sq;
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateUpgradeProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.multisig_enabled @ OneVaultError::MultisigNotEnabled,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [UPGRADE_MULTISIG_SEED],
        bump = upgrade_multisig.bump,
        constraint = upgrade_multisig.key() == protocol_config.upgrade_multisig @ OneVaultError::InvalidMultisig,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,

    #[account(
        init,
        payer = proposer,
        space = 8 + UpgradeProposal::INIT_SPACE,
        seeds = [UPGRADE_PROPOSAL_SEED, upgrade_multisig.key().as_ref(), &proposal_id.to_le_bytes()],
        bump,
    )]
    pub upgrade_proposal: Account<'info, UpgradeProposal>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_upgrade_proposal(
    ctx: Context<CreateUpgradeProposal>,
    proposal_id: u64,
    program_buffer: Pubkey,
    version_label: String,
    expires_in_secs: i64,
) -> Result<()> {
    require!(
        ctx.accounts.upgrade_multisig.is_member(&ctx.accounts.proposer.key()).is_some(),
        OneVaultError::NotMultisigMember
    );
    require!(proposal_id == ctx.accounts.upgrade_multisig.next_proposal_id, OneVaultError::InvalidProposal);
    require!(!version_label.is_empty() && version_label.len() <= 32, OneVaultError::InvalidAmount);
    require!(program_buffer != Pubkey::default(), OneVaultError::InvalidAmount);
    require!(expires_in_secs > 0, OneVaultError::InvalidAmount);

    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.upgrade_proposal;
    proposal.multisig = ctx.accounts.upgrade_multisig.key();
    proposal.proposal_id = proposal_id;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.program_buffer = program_buffer;
    proposal.version_label = version_label.clone();
    proposal.approval_mask = 0;
    proposal.approval_count = 0;
    proposal.status = UpgradeProposalStatus::Pending;
    proposal.created_at = now;
    proposal.expires_at = now.checked_add(expires_in_secs).ok_or(OneVaultError::MathOverflow)?;
    proposal.bump = ctx.bumps.upgrade_proposal;

    ctx.accounts.upgrade_multisig.next_proposal_id = ctx
        .accounts
        .upgrade_multisig
        .next_proposal_id
        .saturating_add(1);

    emit!(UpgradeProposalCreated {
        multisig: ctx.accounts.upgrade_multisig.key(),
        proposal_id,
        proposer: ctx.accounts.proposer.key(),
        program_buffer,
        version_label,
        expires_at: proposal.expires_at,
        timestamp: now,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ApproveUpgradeProposal<'info> {
    pub member: Signer<'info>,

    #[account(
        seeds = [UPGRADE_MULTISIG_SEED],
        bump = upgrade_multisig.bump,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,

    #[account(
        mut,
        seeds = [UPGRADE_PROPOSAL_SEED, upgrade_multisig.key().as_ref(), &upgrade_proposal.proposal_id.to_le_bytes()],
        bump = upgrade_proposal.bump,
        constraint = upgrade_proposal.multisig == upgrade_multisig.key() @ OneVaultError::InvalidProposal,
        constraint = upgrade_proposal.status == UpgradeProposalStatus::Pending @ OneVaultError::ProposalNotPending,
    )]
    pub upgrade_proposal: Account<'info, UpgradeProposal>,
}

pub fn handle_approve_upgrade_proposal(ctx: Context<ApproveUpgradeProposal>) -> Result<()> {
    let member_index = ctx
        .accounts
        .upgrade_multisig
        .is_member(&ctx.accounts.member.key())
        .ok_or(OneVaultError::NotMultisigMember)?;

    let now = Clock::get()?.unix_timestamp;
    require!(
        now <= ctx.accounts.upgrade_proposal.expires_at,
        OneVaultError::ProposalExpired
    );

    let proposal = &mut ctx.accounts.upgrade_proposal;
    require!(
        !ctx.accounts
            .upgrade_multisig
            .has_approved(proposal.approval_mask, member_index),
        OneVaultError::AlreadyApproved
    );

    proposal.approval_mask = UpgradeMultisig::set_approved(proposal.approval_mask, member_index);
    proposal.approval_count = UpgradeMultisig::approval_count(
        proposal.approval_mask,
        ctx.accounts.upgrade_multisig.member_count,
    );

    emit!(UpgradeProposalApproved {
        multisig: ctx.accounts.upgrade_multisig.key(),
        proposal_id: proposal.proposal_id,
        member: ctx.accounts.member.key(),
        approval_count: proposal.approval_count,
        threshold: ctx.accounts.upgrade_multisig.threshold,
        timestamp: now,
    });

    if proposal.approval_count >= ctx.accounts.upgrade_multisig.threshold {
        proposal.status = UpgradeProposalStatus::Approved;
        emit!(UpgradeProposalReady {
            multisig: ctx.accounts.upgrade_multisig.key(),
            proposal_id: proposal.proposal_id,
            program_buffer: proposal.program_buffer,
            version_label: proposal.version_label.clone(),
            timestamp: now,
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CancelUpgradeProposal<'info> {
    pub member: Signer<'info>,

    #[account(
        seeds = [UPGRADE_MULTISIG_SEED],
        bump = upgrade_multisig.bump,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,

    #[account(
        mut,
        seeds = [UPGRADE_PROPOSAL_SEED, upgrade_multisig.key().as_ref(), &upgrade_proposal.proposal_id.to_le_bytes()],
        bump = upgrade_proposal.bump,
        constraint = upgrade_proposal.status == UpgradeProposalStatus::Pending @ OneVaultError::ProposalNotPending,
        close = member,
    )]
    pub upgrade_proposal: Account<'info, UpgradeProposal>,
}

pub fn handle_cancel_upgrade_proposal(ctx: Context<CancelUpgradeProposal>) -> Result<()> {
    let is_proposer = ctx.accounts.upgrade_proposal.proposer == ctx.accounts.member.key();
    let is_member = ctx
        .accounts
        .upgrade_multisig
        .is_member(&ctx.accounts.member.key())
        .is_some();
    require!(is_proposer || is_member, OneVaultError::Unauthorized);

    emit!(UpgradeProposalCancelled {
        multisig: ctx.accounts.upgrade_multisig.key(),
        proposal_id: ctx.accounts.upgrade_proposal.proposal_id,
        cancelled_by: ctx.accounts.member.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct MarkUpgradeExecuted<'info> {
    pub member: Signer<'info>,

    #[account(
        seeds = [UPGRADE_MULTISIG_SEED],
        bump = upgrade_multisig.bump,
    )]
    pub upgrade_multisig: Account<'info, UpgradeMultisig>,

    #[account(
        mut,
        seeds = [UPGRADE_PROPOSAL_SEED, upgrade_multisig.key().as_ref(), &upgrade_proposal.proposal_id.to_le_bytes()],
        bump = upgrade_proposal.bump,
        constraint = upgrade_proposal.status == UpgradeProposalStatus::Approved @ OneVaultError::ProposalNotApproved,
        close = member,
    )]
    pub upgrade_proposal: Account<'info, UpgradeProposal>,
}

pub fn handle_mark_upgrade_executed(ctx: Context<MarkUpgradeExecuted>) -> Result<()> {
    require!(
        ctx.accounts
            .upgrade_multisig
            .is_member(&ctx.accounts.member.key())
            .is_some(),
        OneVaultError::NotMultisigMember
    );

    let proposal = &mut ctx.accounts.upgrade_proposal;
    proposal.status = UpgradeProposalStatus::Executed;

    emit!(UpgradeProposalExecuted {
        multisig: ctx.accounts.upgrade_multisig.key(),
        proposal_id: proposal.proposal_id,
        program_buffer: proposal.program_buffer,
        version_label: proposal.version_label.clone(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
