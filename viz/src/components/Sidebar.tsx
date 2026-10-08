import { Badge, NavLink, ScrollArea, SegmentedControl, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconLayoutGrid, IconSearch } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { problems } from "../problems.ts";
import { tally } from "../progress.ts";
import { useProgress } from "../useProgress.ts";
import { GROUP_INTROS } from "../overviews.ts";
import { groupKeyOf, groupsFor, overviewId, overviewTab, TABS, tabOf, type TabId } from "../sidebarTabs.ts";

/** The topic list: a tab switch, a search box, and each group as a collapsible nav link. */
export function Sidebar({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const progress = useProgress();
  const active = problems.find((p) => p.id === activeId);
  const activeGroup = active ? groupKeyOf(active) : "";
  const [open, setOpen] = useState<Set<string>>(() => new Set([activeGroup]));
  // Opening a topic from anywhere (a link, the overview, a hash) expands its group.
  useEffect(() => {
    if (activeGroup) setOpen((s) => (s.has(activeGroup) ? s : new Set(s).add(activeGroup)));
  }, [activeGroup]);
  const q = query.trim().toLowerCase();
  const tab: TabId = active ? tabOf(active) : (overviewTab(activeId) ?? "algorithms");
  // Coming back to a tab opens the topic you last had open there.
  const last = useRef(new Map<TabId, string>());
  useEffect(() => {
    last.current.set(tab, activeId);
  }, [tab, activeId]);
  const shown = groupsFor(tab, problems);
  const count = shown.reduce((n, g) => n + g.problems.length, 0);
  const noun = TABS.find((t) => t.id === tab)!.noun;
  const matches = (label: string) => (p: { title: string; number: string }) =>
    !q || p.title.toLowerCase().includes(q) || p.number.includes(q) || label.toLowerCase().includes(q);

  return (
    <>
      <Stack gap="sm" p="md" pb="sm" className="sidebar-head">
        <SegmentedControl
          fullWidth
          size="xs"
          styles={{ label: { paddingInline: 4, fontSize: 11 } }}
          value={tab}
          onChange={(v) => {
            if (v !== tab) onSelect(last.current.get(v as TabId) ?? overviewId(v as TabId));
          }}
          data={TABS.map((t) => ({ value: t.id, label: <Tooltip label={t.title}><span>{t.label}</span></Tooltip> }))}
        />
        <TextInput
          placeholder={`Search ${count} ${noun}`}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          leftSection={<IconSearch size={15} />}
          aria-label="Search topics"
        />
      </Stack>
      <ScrollArea className="sidebar-list" type="scroll" px="xs" pb="lg">
        {!q && (
          <NavLink
            label="Overview: what's in this tab"
            leftSection={<IconLayoutGrid size={16} />}
            active={activeId === overviewId(tab)}
            onClick={() => onSelect(overviewId(tab))}
            className="nav-overview"
          />
        )}
        {shown.map((g) => {
          const items = g.problems.filter(matches(g.label));
          if (!items.length) return null;
          const isOpen = Boolean(q) || open.has(g.key);
          const solved = tab === "algorithms" && !q ? tally(progress, g.problems.map((p) => p.id)).solved : 0;
          return (
            <div key={g.key}>
              {g.section && (
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.06em" px="sm" mt="md" mb={4}>
                  {g.section}
                </Text>
              )}
              <NavLink
                label={g.label}
                title={GROUP_INTROS[g.key]}
                opened={isOpen}
                onChange={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                className="nav-group"
                rightSection={
                  <Badge size="sm" variant={isOpen ? "light" : "default"} title={solved ? `${solved} of ${g.problems.length} solved` : undefined}>
                    {solved > 0 && `${solved}/`}
                    {q ? items.length : g.problems.length}
                  </Badge>
                }
                childrenOffset={14}
              >
                {items.map((p) => {
                  const status = progress.entries[p.id]?.status;
                  return (
                    <NavLink
                      key={p.id}
                      active={p.id === activeId}
                      onClick={() => onSelect(p.id)}
                      className="nav-item"
                      leftSection={<span className="prob-num">{p.number}</span>}
                      label={p.title}
                      rightSection={status && <span className={`prob-mark ${status}`} title={status === "solved" ? "Solved" : "Attempted"} />}
                    />
                  );
                })}
              </NavLink>
            </div>
          );
        })}
      </ScrollArea>
    </>
  );
}
