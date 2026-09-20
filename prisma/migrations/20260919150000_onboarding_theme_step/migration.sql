-- Decision D33: sellers choose a website template during onboarding.
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'THEME' AFTER 'TRUST';
