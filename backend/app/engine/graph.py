"""
PULSE — internal directed-graph layer.

A small, dependency-free directed graph purpose-built for lineage reasoning.
Everything is deterministic: adjacency lists are sorted, traversals are
breadth-first with sorted frontiers, and the topological sort is a stable
Kahn's algorithm. We keep our own graph (rather than pulling in NetworkX) so the
engine has zero runtime dependencies and the traversal semantics are explicit
and testable.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterable, Optional

from .states import Criticality, NodeType


@dataclass(frozen=True)
class Asset:
    id: str
    name: str
    type: NodeType
    system: str
    criticality: Criticality
    owner: str
    description: str = ""


@dataclass(frozen=True)
class Dependency:
    upstream: str      # asset id that produces
    downstream: str    # asset id that consumes
    kind: str = "data"


class DependencyGraph:
    """Directed graph: edge upstream -> downstream means data flows that way."""

    def __init__(self, assets: Iterable[Asset], dependencies: Iterable[Dependency]):
        self.assets: dict[str, Asset] = {a.id: a for a in assets}
        self.dependencies: list[Dependency] = list(dependencies)

        self._out: dict[str, list[str]] = defaultdict(list)
        self._in: dict[str, list[str]] = defaultdict(list)
        for d in self.dependencies:
            if d.upstream not in self.assets or d.downstream not in self.assets:
                raise ValueError(f"dependency references unknown asset: {d}")
            self._out[d.upstream].append(d.downstream)
            self._in[d.downstream].append(d.upstream)
        # Deterministic, de-duplicated adjacency.
        for m in (self._out, self._in):
            for k in list(m.keys()):
                m[k] = sorted(set(m[k]))

    # -- basic accessors -------------------------------------------------
    def __contains__(self, nid: str) -> bool:
        return nid in self.assets

    def node(self, nid: str) -> Asset:
        return self.assets[nid]

    def ids(self) -> list[str]:
        return sorted(self.assets.keys())

    def successors(self, nid: str) -> list[str]:
        return list(self._out.get(nid, []))

    def predecessors(self, nid: str) -> list[str]:
        return list(self._in.get(nid, []))

    def nodes_of_type(self, *types: NodeType) -> list[str]:
        wanted = set(types)
        return sorted(i for i, a in self.assets.items() if a.type in wanted)

    def sources(self) -> list[str]:
        return self.nodes_of_type(NodeType.SOURCE)

    # -- traversals ------------------------------------------------------
    def descendants(self, nid: str) -> set[str]:
        """All nodes strictly downstream of `nid`."""
        seen: set[str] = set()
        q = deque(self.successors(nid))
        while q:
            n = q.popleft()
            if n in seen:
                continue
            seen.add(n)
            q.extend(self.successors(n))
        seen.discard(nid)
        return seen

    def ancestors(self, nid: str) -> set[str]:
        """All nodes strictly upstream of `nid`."""
        seen: set[str] = set()
        q = deque(self.predecessors(nid))
        while q:
            n = q.popleft()
            if n in seen:
                continue
            seen.add(n)
            q.extend(self.predecessors(n))
        seen.discard(nid)
        return seen

    def shortest_hops(self, source: str) -> dict[str, int]:
        """BFS hop distance from `source` to every reachable downstream node."""
        dist = {source: 0}
        q = deque([source])
        while q:
            n = q.popleft()
            for s in self.successors(n):
                if s not in dist:
                    dist[s] = dist[n] + 1
                    q.append(s)
        return dist

    def source_ancestors(self, nid: str) -> set[str]:
        return {a for a in self.ancestors(nid) if self.assets[a].type == NodeType.SOURCE}

    def reachable_from_sources(self, target: str, blocked: Optional[set[str]] = None) -> bool:
        """Is `target` reachable from ANY source, avoiding `blocked` nodes?

        Used to test whether removing a node disconnects a consumer from every
        source (single-point-of-failure / dominator detection).
        """
        blocked = blocked or set()
        if target in blocked:
            return False
        seen: set[str] = set()
        q: deque[str] = deque(s for s in self.sources() if s not in blocked)
        while q:
            n = q.popleft()
            if n == target:
                return True
            if n in seen:
                continue
            seen.add(n)
            for s in self.successors(n):
                if s not in blocked:
                    q.append(s)
        return False

    def topological_order(self, subset: Optional[Iterable[str]] = None) -> list[str]:
        """Stable Kahn topological sort over the whole graph or a subset.

        Ties are broken by asset id so the order is fully deterministic.
        """
        nodes = set(subset) if subset is not None else set(self.assets.keys())
        indeg = {n: 0 for n in nodes}
        for n in nodes:
            for s in self.successors(n):
                if s in nodes:
                    indeg[s] += 1
        ready = sorted(n for n in nodes if indeg[n] == 0)
        order: list[str] = []
        while ready:
            n = ready.pop(0)
            order.append(n)
            for s in self.successors(n):
                if s in nodes:
                    indeg[s] -= 1
                    if indeg[s] == 0:
                        # insert keeping the ready list sorted
                        _insort(ready, s)
        if len(order) != len(nodes):
            raise ValueError("cycle detected in dependency graph")
        return order


def _insort(seq: list[str], value: str) -> None:
    lo, hi = 0, len(seq)
    while lo < hi:
        mid = (lo + hi) // 2
        if seq[mid] < value:
            lo = mid + 1
        else:
            hi = mid
    seq.insert(lo, value)
