// ============================================================
// Launchmen Task API
// Developer Candidate Test — Trial 2
// ============================================================
// Instructions:
//   Run with: npm install && node server.js
//   Server starts on: http://localhost:3000
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

const DB_FILE = path.join(__dirname, 'tasks.json');

function loadTasks() {
  if (!fs.existsSync(DB_FILE)) return [];
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(raw);
}

function saveTasks(tasks) {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
}

// GET /tasks
// Returns all tasks. Supports optional status filter.
app.get('/tasks', (req, res) => {
  const tasks = loadTasks();
  const { status } = req.query;
  if (status) {
    const filtered = tasks.filter(t => t.status === status);
    return res.json({ success: true, tasks: filtered });
  }
  res.json({ success: true, tasks });
});

// POST /tasks
// BUG FIX 1: Added missing title validation — returns 400 if title is not provided.
// BUG FIX 2: Status now defaults to "pending" if not provided, as per spec.
// BUG FIX 3: Changed response status to 201 (Created) as per REST convention and spec.
app.post('/tasks', (req, res) => {
  const { title, status } = req.body;

  // BUG FIX 1: title is required — return 400 if missing
  if (!title) {
    return res.status(400).json({ success: false, message: 'Title is required' });
  }

  const tasks = loadTasks();
  const newTask = {
    id: Date.now(),
    title: title,
    status: status || 'pending', // BUG FIX 2: default status to "pending"
  };
  tasks.push(newTask);
  saveTasks(tasks);

  res.status(201).json({ success: true, task: newTask }); // BUG FIX 3: 201 Created
});

// PATCH /tasks/:id
// BUG FIX 4: req.params.id is a string, but task IDs are numbers (Date.now()).
// Without Number() coercion, the strict === comparison always fails and every
// PATCH returns 404 even when the task exists.
app.patch('/tasks/:id', (req, res) => {
  const tasks = loadTasks();
  const { status } = req.body;
  
  // BUG FIX 4: coerce param to number so === matches the numeric ID
  const task = tasks.find(t => t.id === Number(req.params.id));
  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }
  task.status = status;
  saveTasks(tasks);
  res.json({ success: true, task });
});

// DELETE /tasks/:id
// BUG FIX 5: Same ID type mismatch as PATCH — added Number() coercion.
// BUG FIX 6: Added missing 404 guard when task is not found.
// BUG FIX 7: tasks.splice(index, 1) mutates the array in place and returns the
// removed elements. The original code did `tasks = tasks.splice(index, 1)`,
// which replaced the full task list with just the deleted item — saving only
// the deleted task to disk and wiping everything else.
app.delete('/tasks/:id', (req, res) => {
  let tasks = loadTasks();

   // BUG FIX 5: coerce to number for correct strict equality match
  const index = tasks.findIndex(t => t.id === Number(req.params.id));

  // BUG FIX 6: return 404 if task doesn't exist
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }

  // BUG FIX 7: splice mutates in place — do NOT reassign tasks
  tasks.splice(index, 1);
  saveTasks(tasks);
  res.json({ success: true, message: 'Task deleted' });
});

app.listen(3000, () => {
  console.log('Launchmen Task API running on http://localhost:3000');
});


// ============================================================
// TASK 3 — SQL Performance Review
// ============================================================
 
// ------------------------------------------------------------
// Question 1: Identify the issue
// ------------------------------------------------------------
// The code suffers from the N+1 query problem.
//
// It first runs 1 query to fetch 50 posts, then inside a for..of loop it runs
// a separate SELECT query for EACH post to look up its author. That means
// 51 total database round-trips for just 50 posts. As the number of posts
// grows (or if the LIMIT increases), the number of queries grows linearly,
// making the page progressively slower. Each query also has its own network
// latency overhead to the database, compounding the slowdown.
//
// Additionally, the author query uses string interpolation
// (`WHERE id = ${post.author_id}`), which is vulnerable to SQL injection.
 
// ------------------------------------------------------------
// Question 2: How to fix it
// ------------------------------------------------------------
// Replace the loop with a single JOIN query that fetches posts and their
// authors together in one database round-trip:
//
// const postsWithAuthors = await db.query(`
//   SELECT
//     p.id,
//     p.title,
//     p.created_at,
//     a.id   AS author_id,
//     a.name AS author_name,
//     a.email AS author_email
//   FROM posts p
//   JOIN authors a ON a.id = p.author_id
//   ORDER BY p.created_at DESC
//   LIMIT 50
// `);
//
// This retrieves all 50 posts with their author data in exactly 1 query,
// eliminating the N+1 problem entirely. It also removes the string
// interpolation, which should be replaced with parameterized queries
// in any user-input context to prevent SQL injection.