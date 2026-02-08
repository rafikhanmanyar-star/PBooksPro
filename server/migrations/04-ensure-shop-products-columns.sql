-- Ensure shop_products table has all necessary columns for POS/Inventory
-- This script adds columns that might be missing due to schema evolution

DO $$ 
BEGIN
    -- barcode
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='barcode') THEN
        ALTER TABLE shop_products ADD COLUMN barcode TEXT;
    END IF;

    -- category_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='category_id') THEN
        ALTER TABLE shop_products ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
    END IF;

    -- unit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='unit') THEN
        ALTER TABLE shop_products ADD COLUMN unit TEXT DEFAULT 'pcs';
    END IF;

    -- cost_price
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='cost_price') THEN
        ALTER TABLE shop_products ADD COLUMN cost_price DECIMAL(15, 2) DEFAULT 0;
    END IF;

    -- retail_price (already exists in basic but just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='retail_price') THEN
        ALTER TABLE shop_products ADD COLUMN retail_price DECIMAL(15, 2) DEFAULT 0;
    END IF;

    -- tax_rate
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='tax_rate') THEN
        ALTER TABLE shop_products ADD COLUMN tax_rate DECIMAL(5, 2) DEFAULT 0;
    END IF;

    -- reorder_point
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='reorder_point') THEN
        ALTER TABLE shop_products ADD COLUMN reorder_point INTEGER DEFAULT 10;
    END IF;

    -- image_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='image_url') THEN
        ALTER TABLE shop_products ADD COLUMN image_url TEXT;
    END IF;

    -- is_active
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shop_products' AND column_name='is_active') THEN
        ALTER TABLE shop_products ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        -- Set existing nulls to true
        UPDATE shop_products SET is_active = TRUE WHERE is_active IS NULL;
    END IF;

END $$;
