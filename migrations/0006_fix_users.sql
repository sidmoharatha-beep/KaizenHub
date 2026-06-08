-- Add missing columns to users table for designation/section support
ALTER TABLE users ADD COLUMN designation TEXT;
ALTER TABLE users ADD COLUMN section TEXT;