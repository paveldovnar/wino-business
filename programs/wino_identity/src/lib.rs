use anchor_lang::prelude::*;

declare_id!("6oFvAzVT24jz9BJgJUtvorLD2SEZddGFhSSLu246JVt5");

/// Seeds for deriving the identity PDA
pub const IDENTITY_SEED: &[u8] = b"wino_business_identity";

/// Maximum lengths for strings
pub const MAX_NAME_LENGTH: usize = 64;
pub const MAX_LOGO_URI_LENGTH: usize = 200;

#[program]
pub mod wino_identity {
    use super::*;

    /// Create a new business identity PDA
    ///
    /// This creates a unique identity account for a wallet.
    /// Each wallet can only have ONE identity.
    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        name: String,
        logo_uri: String,
    ) -> Result<()> {
        require!(
            name.len() > 0 && name.len() <= MAX_NAME_LENGTH,
            IdentityError::InvalidNameLength
        );
        require!(
            logo_uri.len() <= MAX_LOGO_URI_LENGTH,
            IdentityError::InvalidLogoUriLength
        );

        let identity = &mut ctx.accounts.identity;
        let clock = Clock::get()?;

        identity.authority = ctx.accounts.authority.key();
        identity.identity_type = 1; // 1 = business
        identity.name = name;
        identity.logo_uri = logo_uri;
        identity.created_at = clock.unix_timestamp;
        identity.updated_at = clock.unix_timestamp;
        identity.bump = ctx.bumps.identity;

        msg!("Business identity created for: {}", identity.authority);
        msg!("Name: {}", identity.name);
        msg!("PDA: {}", ctx.accounts.identity.key());

        Ok(())
    }

    /// Update an existing business identity
    ///
    /// Only the original authority can update their identity.
    pub fn update_identity(
        ctx: Context<UpdateIdentity>,
        name: String,
        logo_uri: String,
    ) -> Result<()> {
        require!(
            name.len() > 0 && name.len() <= MAX_NAME_LENGTH,
            IdentityError::InvalidNameLength
        );
        require!(
            logo_uri.len() <= MAX_LOGO_URI_LENGTH,
            IdentityError::InvalidLogoUriLength
        );

        let identity = &mut ctx.accounts.identity;
        let clock = Clock::get()?;

        identity.name = name;
        identity.logo_uri = logo_uri;
        identity.updated_at = clock.unix_timestamp;

        msg!("Business identity updated for: {}", identity.authority);
        msg!("New name: {}", identity.name);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateIdentity<'info> {
    #[account(
        init,
        payer = authority,
        space = BusinessIdentity::SIZE,
        seeds = [IDENTITY_SEED, authority.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, BusinessIdentity>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateIdentity<'info> {
    #[account(
        mut,
        seeds = [IDENTITY_SEED, authority.key().as_ref()],
        bump = identity.bump,
        constraint = identity.authority == authority.key() @ IdentityError::Unauthorized
    )]
    pub identity: Account<'info, BusinessIdentity>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
pub struct BusinessIdentity {
    /// The wallet that owns this identity
    pub authority: Pubkey,
    /// Type of identity (1 = business)
    pub identity_type: u8,
    /// Business name (max 64 bytes)
    pub name: String,
    /// Logo URI on Arweave/Irys (max 200 bytes)
    pub logo_uri: String,
    /// Unix timestamp when created
    pub created_at: i64,
    /// Unix timestamp when last updated
    pub updated_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl BusinessIdentity {
    /// Calculate account size
    /// 8 (discriminator) + 32 (authority) + 1 (identity_type) +
    /// 4+64 (name string) + 4+200 (logo_uri string) + 8 (created_at) + 8 (updated_at) + 1 (bump)
    pub const SIZE: usize = 8 + 32 + 1 + (4 + MAX_NAME_LENGTH) + (4 + MAX_LOGO_URI_LENGTH) + 8 + 8 + 1;
}

#[error_code]
pub enum IdentityError {
    #[msg("Name must be 1-64 characters")]
    InvalidNameLength,
    #[msg("Logo URI must be at most 200 characters")]
    InvalidLogoUriLength,
    #[msg("Only the identity owner can perform this action")]
    Unauthorized,
}
