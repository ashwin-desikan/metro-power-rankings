"use client";

import { useState } from "react";

interface TabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function Tab({ label, isActive, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition ${
        isActive
          ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
          : "text-[var(--text-muted)] border-b-2 border-transparent hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

interface TeamCategoryTabsProps {
  teams: Array<{
    sport: string;
    league: string;
    team: string;
    city: string;
    major: boolean;
  }>;
}

export function TeamCategoryTabs({ teams }: TeamCategoryTabsProps) {
  // Group teams by sport
  const sportGroups = new Map<string, typeof teams>();
  teams.forEach((team) => {
    if (!sportGroups.has(team.sport)) {
      sportGroups.set(team.sport, []);
    }
    sportGroups.get(team.sport)!.push(team);
  });

  const sports = Array.from(sportGroups.keys()).sort();
  const [activeTab, setActiveTab] = useState(sports[0] || "");

  const currentTeams = sportGroups.get(activeTab) || [];
  const majorTeams = currentTeams.filter((t) => t.major);
  const otherTeams = currentTeams.filter((t) => !t.major);

  return (
    <div>
      <div className="flex gap-4 border-b border-[var(--border)] mb-6 overflow-x-auto">
        {sports.map((sport) => (
          <Tab
            key={sport}
            label={sport}
            isActive={activeTab === sport}
            onClick={() => setActiveTab(sport)}
          />
        ))}
      </div>

      <div className="space-y-6">
        {majorTeams.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
              Major League
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {majorTeams.map((team, idx) => (
                <TeamCard key={idx} team={team} />
              ))}
            </div>
          </div>
        )}
        {otherTeams.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-muted)] mb-4">
              Other Teams
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherTeams.map((team, idx) => (
                <TeamCard key={idx} team={team} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({
  team,
}: {
  team: {
    sport: string;
    league: string;
    team: string;
    city: string;
    major: boolean;
  };
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)]">
      <p className="text-xs text-[var(--text-muted)] mb-1">
        {team.league}
      </p>
      <p className="font-semibold text-[var(--text)]">{team.team}</p>
      <p className="text-xs text-[var(--text-dim)]">{team.city}</p>
      {team.major && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <span className="text-xs bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] px-2 py-1 rounded">
            Major
          </span>
        </div>
      )}
    </div>
  );
}

interface CultureCategoryTabsProps {
  culture: Record<string, Array<{ name: string; city: string; subtype: string; type: string }>>;
}

export function CultureCategoryTabs({ culture }: CultureCategoryTabsProps) {
  const types = Object.keys(culture).sort();
  const [activeTab, setActiveTab] = useState(types[0] || "");

  const currentAssets = culture[activeTab] || [];

  return (
    <div>
      <div className="flex gap-4 border-b border-[var(--border)] mb-6 overflow-x-auto">
        {types.map((type) => (
          <Tab
            key={type}
            label={`${type} (${culture[type].length})`}
            isActive={activeTab === type}
            onClick={() => setActiveTab(type)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {currentAssets.map((asset, idx) => (
          <div
            key={idx}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition"
          >
            <p className="font-medium text-[var(--text)]">{asset.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {asset.city}
              {asset.subtype && ` • ${asset.subtype}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
