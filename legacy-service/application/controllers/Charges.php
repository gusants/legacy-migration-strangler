<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Charges extends CI_Controller {

	public function process()
	{
		date_default_timezone_set('UTC');
		$this->load->database();

		$body = $this->input->raw_input_stream;
		$dados = json_decode($body, true);

		$ok = true;
		if (!is_array($dados)) {
			$ok = false;
		} else {
			if (!isset($dados['messageId']) || !is_string($dados['messageId']) || trim($dados['messageId']) == '' || strlen($dados['messageId']) > 128) {
				$ok = false;
			}
			if (!isset($dados['chargeId']) || !is_string($dados['chargeId']) || trim($dados['chargeId']) == '' || strlen($dados['chargeId']) > 128) {
				$ok = false;
			}
			if (!isset($dados['amountCents']) || !is_int($dados['amountCents']) || $dados['amountCents'] <= 0) {
				$ok = false;
			}
			foreach (array('dueDate', 'referenceDate') as $campo) {
				if (!isset($dados[$campo]) || !is_string($dados[$campo])) {
					$ok = false;
				} else {
					$d = DateTime::createFromFormat('!Y-m-d', $dados[$campo], new DateTimeZone('UTC'));
					if (!$d || $d->format('Y-m-d') !== $dados[$campo]) {
						$ok = false;
					}
				}
			}
			if (!isset($dados['paid']) || !is_bool($dados['paid'])) {
				$ok = false;
			}
			if (!isset($dados['planType']) || ($dados['planType'] !== 'monthly' && $dados['planType'] !== 'yearly')) {
				$ok = false;
			}
			if (!isset($dados['failedAttempts']) || !is_int($dados['failedAttempts']) || $dados['failedAttempts'] < 0) {
				$ok = false;
			}
		}
		if (!$ok) {
			$this->output
				->set_status_header(400)
				->set_content_type('application/json')
				->set_output(json_encode(array('error' => 'invalid_payload')));
			return;
		}

		$ja = $this->db->get_where('charge_results', array('message_id' => $dados['messageId']))->row_array();
		if ($ja) {
			$this->output
				->set_content_type('application/json')
				->set_output(json_encode(array(
					'chargeId' => $ja['charge_id'],
					'status' => $ja['status'],
					'daysLate' => (int) $ja['days_late'],
					'fineCents' => (int) $ja['fine_cents'],
					'interestCents' => (int) $ja['interest_cents'],
					'totalCents' => (int) $ja['total_cents']
				)));
			return;
		}

		$valor = $dados['amountCents'] / 100;
		$venc = strtotime($dados['dueDate'] . ' 00:00:00 UTC');
		$ref = strtotime($dados['referenceDate'] . ' 00:00:00 UTC');
		$dias = (int) round(($ref - $venc) / 86400);
		if ($dias < 0) {
			$dias = 0;
		}

		$multa = 0;
		$juros = 0;
		if ($dias > 0) {
			if ($dados['planType'] == 'yearly') {
				if ($dias > 3) {
					$multa = round($valor * 0.02, 2);
					$juros = round($valor * 0.01 / 30 * $dias, 2);
				}
			} else {
				$multa = round($valor * 0.02, 2);
				$juros = round($valor * 0.01 / 30 * $dias, 2);
			}
		}

		if ($dados['paid']) {
			if ($dias > 0) {
				$status = 'paid_late';
			} else {
				$status = 'paid_on_time';
			}
		} else {
			if ($dados['failedAttempts'] >= 3) {
				$status = 'uncollectible';
			} else {
				$status = 'overdue';
			}
		}

		$total = $valor + $multa + $juros;

		$resultado = array(
			'chargeId' => $dados['chargeId'],
			'status' => $status,
			'daysLate' => $dias,
			'fineCents' => (int) round($multa * 100),
			'interestCents' => (int) round($juros * 100),
			'totalCents' => (int) round($total * 100)
		);

		$sql = $this->db->insert_string('charge_results', array(
			'message_id' => $dados['messageId'],
			'charge_id' => $resultado['chargeId'],
			'status' => $resultado['status'],
			'days_late' => $resultado['daysLate'],
			'fine_cents' => $resultado['fineCents'],
			'interest_cents' => $resultado['interestCents'],
			'total_cents' => $resultado['totalCents'],
			'payload' => $body
		));
		$this->db->query(str_replace('INSERT INTO', 'INSERT IGNORE INTO', $sql));

		if ($this->db->affected_rows() == 0) {
			$ja = $this->db->get_where('charge_results', array('message_id' => $dados['messageId']))->row_array();
			$resultado = array(
				'chargeId' => $ja['charge_id'],
				'status' => $ja['status'],
				'daysLate' => (int) $ja['days_late'],
				'fineCents' => (int) $ja['fine_cents'],
				'interestCents' => (int) $ja['interest_cents'],
				'totalCents' => (int) $ja['total_cents']
			);
		}

		$this->output
			->set_content_type('application/json')
			->set_output(json_encode($resultado));
	}
}
