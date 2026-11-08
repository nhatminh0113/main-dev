# The terraform ruleset is bundled with tflint; no plugin download needed.
config {
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "all"
}
