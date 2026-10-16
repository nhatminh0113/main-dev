{{/* Chart name */}}
{{- define "taskapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Release-scoped base name, e.g. "taskapp" */}}
{{- define "taskapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else if contains (include "taskapp.name" .) .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "taskapp.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/* Common labels. Usage: include "taskapp.labels" (dict "ctx" $ "component" "backend") */}}
{{- define "taskapp.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .ctx.Chart.Name .ctx.Chart.Version | replace "+" "_" }}
{{ include "taskapp.selectorLabels" . }}
app.kubernetes.io/version: {{ .ctx.Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .ctx.Release.Service }}
app.kubernetes.io/part-of: taskapp
{{- end }}

{{- define "taskapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "taskapp.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/* Validated application image tag: required, immutable (never "latest"). */}}
{{- define "taskapp.imageTag" -}}
{{- $tag := required "image.tag is required (e.g. --set image.tag=sha-abc1234)" .Values.image.tag -}}
{{- if eq $tag "latest" }}{{ fail "image.tag must be an immutable tag (sha-xxxxxxx), not latest" }}{{ end -}}
{{- $tag -}}
{{- end }}

{{/* Full image reference for an app component. Usage: include "taskapp.image" (dict "ctx" $ "component" "backend") */}}
{{- define "taskapp.image" -}}
{{- $v := .ctx.Values.image -}}
{{- printf "%s/%s/taskapp-%s:%s" $v.registry (lower $v.owner) .component (include "taskapp.imageTag" .ctx) -}}
{{- end }}

{{- define "taskapp.postgresHost" -}}
{{- printf "%s-postgres" (include "taskapp.fullname" .) -}}
{{- end }}

{{/* Pod-level hardening shared by every workload (Pod Security Standard "restricted"). */}}
{{- define "taskapp.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ .uid }}
runAsGroup: {{ .uid }}
fsGroup: {{ .uid }}
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "taskapp.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end }}
