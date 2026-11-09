<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Worker extends CI_Controller {

	public function consume($queue = 'charges-legacy', $max_loops = 0)
	{
		if (!is_cli()) {
			show_404();
			return;
		}

		date_default_timezone_set('UTC');
		$sqs = getenv('SQS_ENDPOINT') ?: 'http://elasticmq:9324';
		$api = getenv('LEGACY_URL') ?: 'http://legacy';
		$queue_url = $sqs . '/000000000000/' . $queue;
		$loops = 0;

		echo date('c') . " worker started queue=" . $queue . "\n";

		while (true) {
			$loops++;
			if ($max_loops > 0 && $loops > $max_loops) {
				break;
			}

			$ch = curl_init($queue_url);
			curl_setopt($ch, CURLOPT_POST, true);
			curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(array(
				'Action' => 'ReceiveMessage',
				'MaxNumberOfMessages' => 10,
				'WaitTimeSeconds' => 20,
				'Version' => '2012-11-05'
			)));
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($ch, CURLOPT_TIMEOUT, 30);
			$xml = curl_exec($ch);
			$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
			curl_close($ch);

			if ($xml === false || $code != 200) {
				echo date('c') . " receive failed http=" . $code . "\n";
				sleep(2);
				continue;
			}

			$res = @simplexml_load_string($xml);
			if (!$res || !isset($res->ReceiveMessageResult->Message)) {
				continue;
			}

			foreach ($res->ReceiveMessageResult->Message as $msg) {
				$body = (string) $msg->Body;
				$handle = (string) $msg->ReceiptHandle;

				$ch = curl_init($api . '/charges/process');
				curl_setopt($ch, CURLOPT_POST, true);
				curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
				curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
				curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
				curl_setopt($ch, CURLOPT_TIMEOUT, 10);
				$out = curl_exec($ch);
				$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
				curl_close($ch);

				if ($status == 200) {
					$ch = curl_init($queue_url);
					curl_setopt($ch, CURLOPT_POST, true);
					curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(array(
						'Action' => 'DeleteMessage',
						'ReceiptHandle' => $handle,
						'Version' => '2012-11-05'
					)));
					curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
					curl_setopt($ch, CURLOPT_TIMEOUT, 10);
					curl_exec($ch);
					curl_close($ch);
					echo date('c') . " processed sqsId=" . $msg->MessageId . " " . $out . "\n";
				} else {
					echo date('c') . " failed sqsId=" . $msg->MessageId . " http=" . $status . " " . $out . "\n";
				}
			}
		}
	}
}
