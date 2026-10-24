// ==========================================
// 1. Mobile navigation
// ==========================================

const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");

menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.textContent = isOpen ? "✕" : "☰";
});

navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";
    });
});


// ==========================================
// 2. Current year in footer
// ==========================================

document.getElementById("year").textContent = new Date().getFullYear();


// ==========================================
// 3. Coding statistics configuration
// ==========================================

const CACHE_KEY = "amk-coding-stats-v1";
const ONE_DAY = 24 * 60 * 60 * 1000;

const API_URLS = {
    leetcode: "https://leetcode-stats.tashif.codes/Abdul_Malik_Khan/stats",
    // codechef: "https://codechef-stats.tashif.codes/cute_trust_22/profile"
    codechef: "https://codechef-stats.tashif.codes/cute_trust_22/stats"
};


// ==========================================
// 4. Small helper functions
// ==========================================

function showText(id, value) {
    document.getElementById(id).textContent = value;
}

function isValidCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function formatCount(value) {
    return value.toLocaleString("en-IN");
}


// ==========================================
// 5. Read the API response safely
// ==========================================

function findSolvedCount(response, platform) {
    if (!response || typeof response !== "object") {
        throw new Error("Invalid API response");
    }

    if (response.status === "error") {
        throw new Error(response.message || "Profile data unavailable");
    }

    const data = response.data ?? response;

    if (!data || typeof data !== "object") {
        throw new Error("No statistics found");
    }

    // LeetCode API documents totalSolved.
    if (platform === "leetcode") {
        const count = data.totalSolved ?? response.totalSolved;

        if (isValidCount(count)) {
            return count;
        }
    }

    // CodeChef API fields may change as its scraper evolves.
    // Only accept explicit solved-count fields, never rating or rank.
    const possibleKeys = [
        "totalProblemsSolved",
        "total_problems_solved",
        "totalSolved",
        "total_solved",
        "problemsSolved",
        "problems_solved"
    ];

    for (const key of possibleKeys) {
        const value = data[key];

        if (isValidCount(value)) {
            return value;
        }

        // Some APIs place the count inside an object.
        if (value && typeof value === "object") {
            const nestedValue =
                value.total ??
                value.count ??
                value.solved;

            if (isValidCount(nestedValue)) {
                return nestedValue;
            }
        }
    }

    throw new Error("Solved count field not found");
}


// ==========================================
// 6. Fetch one platform's statistics
// ==========================================

async function fetchSolvedCount(platform) {
    const response = await fetch(API_URLS[platform], {
        method: "GET",
        headers: {
            Accept: "application/json"
        },
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Request failed (" + response.status + ")");
    }

    const json = await response.json();
    return findSolvedCount(json, platform);
}


// ==========================================
// 7. Load and save browser cache
// ==========================================

function readCache() {
    try {
        const saved = localStorage.getItem(CACHE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
}

function saveCache(cache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // The page can still work if browser storage is unavailable.
    }
}


// ==========================================
// 8. Show a count on the page
// ==========================================

function renderCount(platform, count, statusMessage) {
    showText(platform + "-solved", formatCount(count));
    showText(platform + "-bar-value", formatCount(count));
    showText(platform + "-status", statusMessage);
}


// ==========================================
// 9. Draw the comparison bars
// ==========================================

function updateBars(cache) {
    const leetcodeCount = cache.leetcode?.count;
    const codechefCount = cache.codechef?.count;

    const counts = [leetcodeCount, codechefCount].filter(isValidCount);
    const maximum = counts.length ? Math.max(...counts) : 0;

    const platforms = [
        ["leetcode", leetcodeCount],
        ["codechef", codechefCount]
    ];

    platforms.forEach(([platform, count]) => {
        const bar = document.getElementById(platform + "-bar");

        if (!isValidCount(count) || maximum === 0) {
            bar.style.width = "0%";
            return;
        }

        bar.style.width = ((count / maximum) * 100) + "%";
    });
}


// ==========================================
// 10. Show previously saved data
// ==========================================

function showSavedData(cache) {
    ["leetcode", "codechef"].forEach((platform) => {
        const saved = cache[platform];

        if (!saved || !isValidCount(saved.count)) {
            showText(platform + "-solved", "--");
            showText(platform + "-bar-value", "--");
            showText(platform + "-status", "Data not available yet");
            return;
        }

        renderCount(
            platform,
            saved.count,
            "Showing saved data; checking for updates..."
        );
    });

    updateBars(cache);

    const dates = ["leetcode", "codechef"]
        .map((platform) => cache[platform]?.fetchedAt)
        .filter((time) => Number.isFinite(time));

    if (dates.length) {
        const latest = Math.max(...dates);

        showText(
            "stats-updated",
            "Latest successful fetch: " +
                new Date(latest).toLocaleString()
        );
    }
}


// ==========================================
// 11. Fetch statistics when needed
// ==========================================

async function refreshCodingStats(forceRefresh = false) {
    const button = document.getElementById("refresh-stats");

    button.disabled = true;
    button.textContent = "Fetching...";

    const cache = readCache();

    // Display last saved values immediately, if available.
    showSavedData(cache);

    const platforms = ["leetcode", "codechef"];

    const platformsToFetch = platforms.filter((platform) => {
        const saved = cache[platform];

        if (forceRefresh || !saved) {
            return true;
        }

        if (!Number.isFinite(saved.fetchedAt)) {
            return true;
        }

        return Date.now() - saved.fetchedAt >= ONE_DAY;
    });

    if (platformsToFetch.length === 0) {
        showText(
            "stats-updated",
            "Stats checked within the last 24 hours. Use Refresh Statistics to check again."
        );

        button.disabled = false;
        button.textContent = "Refresh Statistics";
        return;
    }

    const results = await Promise.allSettled(
        platformsToFetch.map(async (platform) => {
            const count = await fetchSolvedCount(platform);
            return { platform, count };
        })
    );

    let successCount = 0;

    results.forEach((result, index) => {
        const platform = platformsToFetch[index];

        if (result.status === "fulfilled") {
            const count = result.value.count;

            cache[platform] = {
                count,
                fetchedAt: Date.now()
            };

            renderCount(
                platform,
                count,
                "Live data fetched successfully"
            );

            successCount++;
        } else {
            const saved = cache[platform];

            if (saved && isValidCount(saved.count)) {
                renderCount(
                    platform,
                    saved.count,
                    "Refresh failed; showing last saved data"
                );
            } else {
                showText(platform + "-solved", "--");
                showText(platform + "-bar-value", "--");
                showText(
                    platform + "-status",
                    "Could not load data. The API may be unavailable."
                );
            }
        }
    });

    saveCache(cache);
    updateBars(cache);

    const savedTimes = platforms
        .map((platform) => cache[platform]?.fetchedAt)
        .filter((time) => Number.isFinite(time));

    if (successCount > 0 && savedTimes.length > 0) {
        showText(
            "stats-updated",
            "Last successful fetch: " +
                new Date(Math.max(...savedTimes)).toLocaleString()
        );
    } else {
        showText(
            "stats-updated",
            "Unable to fetch new data. Any previously saved counts are retained."
        );
    }

    button.disabled = false;
    button.textContent = "Refresh Statistics";
}


// ==========================================
// 12. Manual refresh button
// ==========================================

document.getElementById("refresh-stats").addEventListener("click", () => {
    refreshCodingStats(true);
});


// ==========================================
// 13. Load statistics when the page opens
// ==========================================

refreshCodingStats().catch(() => {
    showText(
        "stats-updated",
        "An unexpected error occurred while loading statistics."
    );

    const button = document.getElementById("refresh-stats");
    button.disabled = false;
    button.textContent = "Refresh Statistics";
});