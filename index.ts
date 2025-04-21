#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

// Import clack for CLI commands and fast-xml-parser for handling WordPress export XML.
import {
  intro,
  outro,
  log,
  spinner,
  text,
  isCancel,
  cancel,
  multiselect,
} from "npm:@clack/prompts";
import { XMLParser, XMLBuilder } from "npm:fast-xml-parser@latest";

import { google } from "npm:@ai-sdk/google@latest";
import { generateText } from "npm:ai@latest";

function normalizeTitle(title: string): string {
  return title
    .replace(/&amp;/g, "&")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Use the Vercel AI package to categorize the blog post based on its title.
 *
 * This function sends the blog post title to the AI (using OpenAI’s GPT)
 * and asks for a one-word category, such as “News”, “Tech”, “Food”, “Travel”, etc.
 *
 * @param title - The blog post title.
 * @returns A promise that resolves with the chosen category.
 */
async function categorizeTitlesInBatch(
  titles: string[],
  allowedCategories: string[]
): Promise<{ [postName: string]: string[] }> {
  const prompt = `You are given a unique JSON array of blog post titles. Each title must be categorized with one of the allowed category slugs below.

Return a JSON array of objects like this:

[
  { "title": "The Original Title", "categories": ["category-one", "category-two"] }
]

Rules:
- You must match the exact title string provided.
- The "categories" field must be an array of strings.
- Only use categories from this list: ${JSON.stringify(allowedCategories)}
- Only return categories that are listed. Do not invent new ones.
- The title list will change for each request. Never return titles not present in this list.

Titles: ${JSON.stringify(titles)}
`;

  const { text } = await generateText({
    model: google("gemini-2.0-flash-lite"),
    system:
      "You are a helpful assistant that classifies blog posts into one-word categories.",
    prompt,
  });

  const cleanedText = text.replace(/^```json\s*|```$/g, "").trim();
  const result = JSON.parse(cleanedText);

  if (!Array.isArray(result)) {
    throw new Error("AI response is not an array.");
  }

  const validated: { [title: string]: string[] } = {};
  for (const entry of result) {
    if (
      typeof entry !== "object" ||
      typeof entry.title !== "string" ||
      !Array.isArray(entry.categories)
    ) {
      continue;
    }

    const filtered = entry.categories.filter(
      (c: any) => typeof c === "string" && allowedCategories.includes(c)
    );

    if (filtered.length > 0) {
      validated[entry.title] = filtered;
    }
  }

  return validated;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Processes a WordPress XML export file.
 *
 * Reads the input file and parses it into an object, then iterates
 * over each <item> (blog post) to determine a new category using the AI function
 * based on the post title. Finally, the function rebuilds the XML and writes it to a new file.
 *
 * @param inputPath - The path to the input WordPress XML export file.
 * @param xmlOutputPath - The path to save the updated XML file.
 * @param csvOutputPath - The path to save the updated CSV file.
 * @param allowedCategories - The list of allowed categories for categorization.
 */
async function processXML(
  inputPath: string,
  xmlOutputPath: string,
  csvOutputPath: string,
  allowedCategories: string[]
): Promise<void> {
  const seenIds = new Set<string>();

  // Read the input XML file.
  const xmlData = await Deno.readTextFile(inputPath);

  // Parse the XML into a JavaScript object.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const jsonObj = parser.parse(xmlData);

  // Find the blog posts. WordPress exports them under <rss><channel><item>.
  const items = jsonObj?.rss?.channel?.item;
  if (!items) {
    log.error(
      "No <item> elements found in the XML. Please check the file structure."
    );
    return;
  }

  // Ensure items is an array.
  const posts = Array.isArray(items) ? items : [items];

  // Process each post: use the title for AI categorization.
  const uncategorizedPosts = posts.filter(
    (p) => typeof p.title === "string" && p["wp:post_type"] === "post"
  );

  // console.log({ uncategorizedPosts });

  while (uncategorizedPosts.length > 0) {
    const batch = uncategorizedPosts
      .filter((p) => !seenIds.has(p["wp:post_id"]))
      .slice(0, 50);
    const s = spinner();
    s.start(`Categorizing batch of ${batch.length} titles...`);
    const titleList = batch.map((p) => p.title);
    const mapping = await categorizeTitlesInBatch(titleList, allowedCategories);
    s.stop(`Categorized batch.`);

    for (let i = uncategorizedPosts.length - 1; i >= 0; i--) {
      const post = uncategorizedPosts[i];
      const title = post.title;
      const id = post["wp:post_id"];
      const normalized = normalizeTitle(title);
      const matchedCategories = Object.entries(mapping).find(
        ([mappedTitle]) => normalizeTitle(mappedTitle) === normalized
      )?.[1];
      if (matchedCategories) {
        post.category = matchedCategories.map((slug) => ({
          "@_domain": "category",
          "@_nicename": slug,
          "#text": slug
            .split("-")
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" "),
        }));
        log.step(
          `Assigned categories ${matchedCategories.join(
            ", "
          )} to post "${title}"`
        );
        seenIds.add(id);
        uncategorizedPosts.splice(i, 1);
      }
    }

    // Requeue unmatched titles
    for (const p of batch) {
      if (!mapping[p.title]) {
        uncategorizedPosts.push(p);
      }
    }
  }

  if (xmlOutputPath) {
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
    });
    const newXML = builder.build(jsonObj);
    await Deno.writeTextFile(xmlOutputPath, newXML);
    log.success(`Updated XML file written to: ${xmlOutputPath}`);
  }

  if (csvOutputPath) {
    const lines = ["post id,post title,categories"];
    const categorizedPosts = posts.filter((post) =>
      Array.isArray(post.category)
    );

    for (const post of categorizedPosts) {
      const id = post["wp:post_id"];
      const title = post.title;
      const categories = post.category
        .map((c: Record<string, string>) => c["@_nicename"])
        .join("|");
      lines.push(`"${id}","${title.replace(/"/g, '""')}","${categories}"`);
    }

    await Deno.writeTextFile(csvOutputPath, lines.join("\n"));
    log.success(`CSV file written to: ${csvOutputPath}`);
  }

  log.success("All done!");
}

async function main() {
  intro("WordPress AI Categorizer");

  const input = await text({
    message: "Enter the path to the WordPress XML export file:",
    placeholder: "export.xml",
    validate(value: string) {
      const trimmed = value.trim();
      if (trimmed === "") return "A file path is required.";
      try {
        const stat = Deno.statSync(trimmed.replace(/^['"]|['"]$/g, ""));
        if (!stat.isFile) return "Provided path is not a file.";
      } catch {
        return "File not found.";
      }
    },
  });

  if (isCancel(input)) {
    cancel("Operation cancelled.");
    Deno.exit(0);
  }

  const inputPath = input.trim().replace(/^['"]|['"]$/g, "");

  const formatSelection = await multiselect({
    message: "Select export formats:",
    options: [
      { value: "xml", label: "XML" },
      { value: "csv", label: "CSV" },
    ],
    required: true,
  });

  if (isCancel(formatSelection)) {
    cancel("Operation cancelled.");
    Deno.exit(0);
  }

  const exportXML = formatSelection.includes("xml");
  const exportCSV = formatSelection.includes("csv");

  let xmlOutputPath = "";
  if (exportXML) {
    const output = await text({
      message: "Enter XML output file path (or leave blank for default):",
      placeholder: `${inputPath.replace(".xml", "")}.out.xml`,
    });

    if (isCancel(output)) {
      cancel("Operation cancelled.");
      Deno.exit(0);
    }

    xmlOutputPath =
      output.trim() === ""
        ? `${inputPath}.out.xml`
        : output.trim().replace(/^['"]|['"]$/g, "");
  }

  let csvOutputPath = "";
  if (exportCSV) {
    const csvOut = await text({
      message: "Enter CSV output file path (or leave blank for default):",
      placeholder: `${inputPath.replace(".xml", "")}.out.csv`,
    });

    if (isCancel(csvOut)) {
      cancel("Operation cancelled.");
      Deno.exit(0);
    }

    csvOutputPath =
      csvOut.trim() === ""
        ? `${inputPath}.out.csv`
        : csvOut.trim().replace(/^['"]|['"]$/g, "");
  }

  const rawCategories = await text({
    message: "Enter the allowed categories (comma-separated slugs):",
    placeholder: "news, lifestyle, health, food",
    validate(value) {
      return value.trim() === ""
        ? "You must enter at least one category."
        : undefined;
    },
  });

  if (isCancel(rawCategories)) {
    cancel("Operation cancelled.");
    Deno.exit(0);
  }

  const allowedCategories = rawCategories
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  try {
    await processXML(
      inputPath,
      exportXML ? xmlOutputPath : "",
      exportCSV ? csvOutputPath : "",
      allowedCategories
    );
  } catch (err) {
    log.error("Something went wrong:");
    console.error(err);
    outro("Process failed.");
  }
}

await main();
