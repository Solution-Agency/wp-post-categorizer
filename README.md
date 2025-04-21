# WordPress Blog Post Categorizer

Automatically categorize your WordPress blog posts using Google Gemini.

---

## ✨ Features

- Categorizes blog posts using AI (Google Gemini)
- Supports multiple output formats: XML and CSV
- Allows multiple categories per post
- Outputs post ID, title, categories, and edit link in CSV
- Supports category validation and batching

---

## 🔧 Requirements

- [Deno](https://deno.land/#installation)
- A [Gemini API key](https://aistudio.google.com/app/apikey)

Create a `.env` file in your project root:

```env
GOOGLE_API_KEY=your-api-key-here
```

---

## 📤 Exporting from WordPress

1. Log in to your WordPress dashboard
2. Go to `Tools` → `Export`
3. Choose `Posts`
4. Download the `.xml` file

---

## 🚀 Usage

Run the script with:

```bash
deno run --env-file=.env --allow-env --allow-read --allow-net --allow-write index.ts
```

You’ll be prompted to:

- Select the XML file you exported
- Choose one or more export formats (XML, CSV)
- Provide allowed category slugs (e.g. `news, memory-care, senior-life`)
- Provide output file paths (or accept the default suggestions)

Once complete:

1. **Delete existing posts** from WordPress (optional but useful for clean import)
2. **Import the new XML** using `Tools` → `Import` → `WordPress`

If using CSV, you can use the [WP All Import plugin](https://www.wpallimport.com/) to import instead.

---

## 📄 CSV Output

The CSV includes:

- `post id`
- `post title`
- `categories` (pipe-separated)
- `edit link` (based on the site URL from the XML)

---

## 🧊 Precompiled Executable (Mac ARM)

If you don’t want to install Deno, use the precompiled version:

📦 [Download for Mac ARM](https://bitbucket.org/primax/wp-post-categorizer/downloads/wp-blog-post-categorizer)

Make it executable and run it:

```bash
chmod +x wp-blog-post-categorizer
./wp-blog-post-categorizer
```

---

## 🧪 Usage Example

```
Enter the path to the WordPress XML export file:
> exports/posts.xml

Select export formats:
✔ XML
✔ CSV

Enter XML output file path (or leave blank for default):
> exports/posts.out.xml

Enter CSV output file path (or leave blank for default):
> exports/posts.out.csv

Enter allowed categories:
> news, memory-care, senior-life
```

---