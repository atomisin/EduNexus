#!/usr/bin/env node
/**
 * EduNexus Session End Hook
 * Automatically updates AGENTS.md after each coding session.
 * Works with both OpenCode and Antigravity.
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const AGENTS_MD = path.join(PROJECT_ROOT, 'AGENTS.md')
const SESSION_LOG = path.join(PROJECT_ROOT, '.agent', 'session-log.json')

// Read session input from stdin (OpenCode/Antigravity pass session data here)
let input = ''
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  try {
    const session = input ? JSON.parse(input) : {}
    updateAgentsMd(session)
  } catch {
    // If no valid JSON, still try to update
    updateAgentsMd({})
  }
})

function updateAgentsMd(session) {
  const now = new Date().toISOString().split('T')[0]
  
  // Load existing AGENTS.md
  let content = fs.existsSync(AGENTS_MD) 
    ? fs.readFileSync(AGENTS_MD, 'utf8') 
    : ''

  // Load session log to track cumulative changes
  let log = fs.existsSync(SESSION_LOG)
    ? JSON.parse(fs.readFileSync(SESSION_LOG, 'utf8'))
    : { sessions: [], known_stable: [], open_issues: [] }

  // Update the "Last updated" line
  if (content.includes('Last updated:')) {
    content = content.replace(
      /Last updated: .*/,
      `Last updated: ${now}`
    )
  } else {
    content = `Last updated: ${now}\n\n` + content
  }

  // Append any new rules discovered this session
  // The agent writes to .agent/session-notes.md during the session
  const notesFile = path.join(PROJECT_ROOT, '.agent', 'session-notes.md')
  if (fs.existsSync(notesFile)) {
    const notes = fs.readFileSync(notesFile, 'utf8').trim()
    if (notes) {
      // Append to Critical Rules section if notes exist
      if (content.includes('## Critical rules')) {
        content = content.replace(
          /## Critical rules.*?(?=\n##)/s,
          match => match.trimEnd() + '\n' + notes + '\n\n'
        )
      }
      // Clear session notes after incorporating
      fs.writeFileSync(notesFile, '')
    }
  }

  fs.writeFileSync(AGENTS_MD, content)
  console.error(`[EduNexus Hook] AGENTS.md updated: ${now}`)
}