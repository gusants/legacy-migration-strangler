<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Charges extends CI_Controller {

	public function process()
	{
		date_default_timezone_set('UTC');
		$this->load->database();

		$body = $this->input->raw_input_stream;
		$dados = json_decode($body, true);

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

		$this->db->insert('charge_results', array(
			'message_id' => $dados['messageId'],
			'charge_id' => $resultado['chargeId'],
			'status' => $resultado['status'],
			'days_late' => $resultado['daysLate'],
			'fine_cents' => $resultado['fineCents'],
			'interest_cents' => $resultado['interestCents'],
			'total_cents' => $resultado['totalCents'],
			'payload' => $body
		));

		$this->output
			->set_content_type('application/json')
			->set_output(json_encode($resultado));
	}
}
