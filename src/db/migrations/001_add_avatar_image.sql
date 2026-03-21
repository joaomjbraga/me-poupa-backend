-- Migration: Add avatar_image column to users table
-- Run this script if you already have an existing database

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_image VARCHAR(255);
