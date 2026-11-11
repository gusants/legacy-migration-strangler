CREATE TABLE IF NOT EXISTS charge_results (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(128) NOT NULL,
  charge_id VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL,
  days_late INT NOT NULL,
  fine_cents INT NOT NULL,
  interest_cents INT NOT NULL,
  discount_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_charge_results_message_id (message_id),
  KEY ix_charge_results_charge_id (charge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
