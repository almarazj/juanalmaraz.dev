resource "aws_scheduler_schedule" "probe" {
  name                = "juanalmaraz-probe"
  schedule_expression = "rate(5 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.probe.arn
    role_arn = aws_iam_role.scheduler.arn

    # A retried invocation could count more successes than the slots the uptime ratio expects.
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
