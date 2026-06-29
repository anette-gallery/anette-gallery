CREATE TABLE customers (
  id UUID PRIMARY KEY,
  phone VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  loyalty_card_number VARCHAR(64),
  address TEXT,
  maxma_customer_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  brand VARCHAR(255),
  color VARCHAR(64),
  size VARCHAR(64),
  weight NUMERIC(10, 3),
  dimensions VARCHAR(128),
  source_system VARCHAR(32) NOT NULL DEFAULT '1c',
  tilda_product_id VARCHAR(128),
  last_modified_source VARCHAR(32),
  last_modified_at TIMESTAMPTZ,
  onec_updated_at TIMESTAMPTZ,
  tilda_updated_at TIMESTAMPTZ,
  preserve_tilda_overrides BOOLEAN NOT NULL DEFAULT TRUE,
  manual_override_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  source_system VARCHAR(32) NOT NULL DEFAULT '1c',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  external_order_id VARCHAR(128),
  status VARCHAR(64) NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL,
  promo_code VARCHAR(64),
  gift_card_number VARCHAR(64),
  loyalty_card_number VARCHAR(64),
  loyalty_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  promo_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gift_card_writeoff_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  source_channel VARCHAR(32) NOT NULL DEFAULT 'nextjs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  sku VARCHAR(64) NOT NULL,
  title_snapshot VARCHAR(255),
  quantity INT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL
);

CREATE TABLE integrations_log (
  id UUID PRIMARY KEY,
  system_name VARCHAR(32) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_key VARCHAR(128),
  direction VARCHAR(32) NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_queue (
  id UUID PRIMARY KEY,
  source_system VARCHAR(32) NOT NULL,
  target_system VARCHAR(32) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_key VARCHAR(128),
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_integrations_log_system_name ON integrations_log(system_name);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
