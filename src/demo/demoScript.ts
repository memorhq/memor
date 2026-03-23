export type DemoStep = {
  step: number;
  title: string;
  target: string;
  description: string;
};

export type DemoScript = {
  steps: DemoStep[];
};

export function buildDemoScript(repoMode: string): DemoScript {
  if (repoMode === "product-web-app") {
    return {
      steps: [
        { step: 1, title: "What this app is", target: "aha-summary", description: "The app identity, type, and tech stack at a glance." },
        { step: 2, title: "Where to start", target: "reading-order", description: "Begin at the app shell, then follow the dashboard and API paths." },
        { step: 3, title: "How requests flow", target: "flows", description: "User journey, data request, and dev loop patterns." },
        { step: 4, title: "What is tightly coupled", target: "couplings", description: "Surfaces, components, and API layers that amplify change." },
        { step: 5, title: "What is risky to change", target: "change-impact", description: "Select a system to see its blast radius before refactoring." },
      ],
    };
  }

  return {
    steps: [
      { step: 1, title: "What this repo is", target: "aha-summary", description: "The repo identity, architecture shape, and key zones." },
      { step: 2, title: "Where to start", target: "reading-order", description: "Follow the recommended reading path from entry to internals." },
      { step: 3, title: "How work moves", target: "flows", description: "Runtime, build, and extension flows through the system." },
      { step: 4, title: "What is tightly coupled", target: "couplings", description: "The connections most likely to amplify change." },
      { step: 5, title: "What is risky to change", target: "change-impact", description: "Select a system to estimate blast radius before refactoring." },
    ],
  };
}
