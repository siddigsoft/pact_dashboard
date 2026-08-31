import {
  BarChart,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

const queries = [
  { name: "Realtime change feed", calls: 793787, mean: 13.21, total: 10484, kind: "Platform" },
  { name: "MMP site entries read", calls: 15604, mean: 111.27, total: 1736, kind: "Application" },
  { name: "Reopen down payment", calls: 264, mean: 781.03, total: 206, kind: "Application" },
  { name: "Monitoring actions", calls: 271, mean: 505.64, total: 137, kind: "Application" },
  { name: "Advance coverage", calls: 1386, mean: 67.64, total: 94, kind: "Application" },
  { name: "Payment recording", calls: 215, mean: 420.23, total: 90, kind: "Application" },
];

const findings = [
  { name: "Overlapping permissive policies", value: 899 },
  { name: "Unindexed foreign keys", value: 608 },
  { name: "RLS auth init-plan", value: 472 },
  { name: "Unused-index signals", value: 331 },
  { name: "Duplicate index pairs", value: 7 },
];

const phases = [
  ["0", "Baseline", "Capture plans and workflow benchmarks", "1 day"],
  ["1", "Security", "Fix RLS exposure and privileged grants", "2–5 days"],
  ["2", "Monitoring path", "Push filters, paginate, defer JSON details", "2–4 days"],
  ["3", "Hot queries", "Tune MMP, payment and coverage RPCs", "2–4 days"],
  ["4", "Policy + index", "Consolidate RLS and index portfolio", "3–7 days"],
  ["5", "Schema lifecycle", "Classify and retire unused schema", "Ongoing"],
];

function Pipeline() {
  const theme = useHostTheme();
  const nodes = [
    { x: 16, w: 132, label: "Clients", sub: "request demand" },
    { x: 184, w: 150, label: "PostgREST", sub: "31 idle / pooled" },
    { x: 370, w: 148, label: "RLS", sub: "1,371 policy warnings" },
    { x: 554, w: 180, label: "Monitoring RPC", sub: "506 ms · 16 GiB temp" },
    { x: 770, w: 150, label: "10 source tables", sub: "wide JSON + sort" },
  ];
  return (
    <svg viewBox="0 0 936 152" role="img" aria-label="PACT database request path and bottleneck chain" style={{ width: "100%", minHeight: 152 }}>
      <title>Connection and query bottleneck path</title>
      {nodes.slice(0, -1).map((n, i) => {
        const next = nodes[i + 1];
        return <line key={n.label} x1={n.x + n.w} y1={72} x2={next.x} y2={72} stroke={theme.stroke.primary} strokeWidth={i >= 2 ? 5 : 2} />;
      })}
      {nodes.map((n, i) => (
        <g key={n.label}>
          <rect x={n.x} y={35} width={n.w} height={74} rx={8} fill={i >= 2 ? theme.fill.secondary : theme.fill.tertiary} stroke={i === 3 ? theme.accent.primary : theme.stroke.secondary} />
          <text x={n.x + n.w / 2} y={65} textAnchor="middle" fill={theme.text.primary} fontSize="13" fontWeight="600">{n.label}</text>
          <text x={n.x + n.w / 2} y={87} textAnchor="middle" fill={theme.text.secondary} fontSize="11">{n.sub}</text>
        </g>
      ))}
      <text x="468" y="133" textAnchor="middle" fill={theme.text.secondary} fontSize="11">Connection count is healthy; work amplification begins at RLS and peaks in the monitoring union/sort.</text>
    </svg>
  );
}

export default function PactDbEvaluation() {
  const [view, setView] = useCanvasState("pact-db-view", "latency");
  const latency = view === "latency";
  return (
    <Stack gap={18} style={{ padding: 20 }}>
      <Stack gap={6}>
        <H1>PACT database evaluation</H1>
        <Text tone="secondary">Live read-only assessment · Supabase project abznugnirnlrqnnfkein · 31 Aug 2026</Text>
      </Stack>

      <Callout tone="warning" title="Healthy now, scaling debt is concentrated">
        Cache and live connection behavior are strong. The monitoring query, RLS fan-out, and privileged API surface require the first intervention—not a compute upgrade.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="969 MiB" label="Database size" />
        <Stat value="50 / 90" label="Connections occupied" tone="info" />
        <Stat value="99.96%" label="Table cache hit" tone="success" />
        <Stat value="16 GiB" label="Monitoring temp spill" tone="danger" />
      </Grid>

      <H2>Where requests accumulate work</H2>
      <Pipeline />

      <Row gap={8} wrap>
        <Pill active={latency} onClick={() => setView("latency")}>Mean latency</Pill>
        <Pill active={!latency} onClick={() => setView("total")}>Cumulative execution</Pill>
      </Row>
      <BarChart
        categories={queries.map((q) => q.name)}
        series={[{
          name: latency ? "Mean latency" : "Total execution",
          data: queries.map((q) => latency ? q.mean : q.total),
          tone: latency ? "warning" : "info",
        }]}
        horizontal
        height={300}
        valueSuffix={latency ? " ms" : " s"}
        referenceLines={latency ? [{ value: 250, label: "Read target", tone: "danger" }] : undefined}
        showValues
      />
      <Text size="small" tone="secondary">Source: extensions.pg_stat_statements · cumulative since an unknown statistics reset. Realtime is platform traffic; the remaining entries are application paths.</Text>

      <H2>Advisor workload</H2>
      <BarChart
        categories={findings.map((f) => f.name)}
        series={[{ name: "Findings", data: findings.map((f) => f.value), tone: "warning" }]}
        horizontal
        height={250}
        showValues
      />
      <Text size="small" tone="secondary">Source: Supabase performance advisor at 2026-08-31. Findings are review signals; they should not be bulk-applied.</Text>

      <Grid columns="minmax(0, 1.2fr) minmax(0, 0.8fr)" gap={16}>
        <Stack gap={8}>
          <H2>Required sequence</H2>
          <Table
            headers={["Phase", "Focus", "Outcome", "Estimate"]}
            rows={phases}
            columnAlign={["center", "left", "left", "right"]}
            rowTone={["info", "danger", "warning", "warning", "info", "neutral"]}
          />
        </Stack>
        <Card>
          <CardHeader trailing="Release gate">Security exposure</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Stat value="13" label="Public tables with RLS disabled" tone="danger" />
              <Text>Design and test policies before enabling RLS. Audit public SECURITY DEFINER functions and remove unintended API-role execution.</Text>
              <Text tone="secondary" size="small">Do not combine this security rollout with query tuning in one production change.</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>Success measures</H2>
      <Table
        headers={["Measure", "Current signal", "Target"]}
        rows={[
          ["Monitoring p95", "Up to 934 ms; 16 GiB temp spill", "<250 ms; negligible temp writes"],
          ["Connection pressure", "56% occupied; mostly idle pools", "<70% at peak; no sustained waits"],
          ["Critical security findings", "31 errors; 13 RLS-disabled tables", "Zero"],
          ["Index changes", "608 missing-FK and 331 unused signals", "Every change justified by a plan"],
          ["Cache efficiency", "99.96% table / 99.92% index", "Remain above 99%"],
        ]}
        rowTone={["danger", "success", "danger", "warning", "success"]}
      />
    </Stack>
  );
}

