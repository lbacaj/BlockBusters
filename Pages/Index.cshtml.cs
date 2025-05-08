using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using BlockPuzzleGame.Data;
using BlockPuzzleGame.Models;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Text.Json;

namespace BlockPuzzleGame.Pages;

public class IndexModel : PageModel
{
    private readonly ILogger<IndexModel> _logger;
    private readonly ApplicationDbContext _context;

    public IndexModel(ILogger<IndexModel> logger, ApplicationDbContext context)
    {
        _logger = logger;
        _context = context;
    }

    [BindProperty]
    public LeaderboardEntry NewEntry { get; set; } = new() { PlayerName = "" };

    public List<LeaderboardEntry> TopScores { get; set; } = new();

    public async Task OnGetAsync()
    {
        TopScores = await _context.LeaderboardEntries
            .OrderByDescending(entry => entry.Score)
            .Take(10)
            .ToListAsync();
    }

    public async Task<IActionResult> OnPostSaveScoreAsync([FromBody] object rawData)
    {
        // Log the raw data received
        _logger.LogInformation("Received raw data: {RawData}", rawData);
        
        // Try to extract player name and score manually
        string playerName = "";
        int score = 0;
        
        try 
        {
            // Convert to dictionary and try to extract values regardless of casing
            var data = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                System.Text.Json.JsonSerializer.Serialize(rawData));
                
            foreach (var entry in data)
            {
                if (entry.Key.Equals("playerName", StringComparison.OrdinalIgnoreCase) ||
                    entry.Key.Equals("PlayerName", StringComparison.OrdinalIgnoreCase))
                {
                    playerName = entry.Value.GetString() ?? "Anonymous";
                }
                else if (entry.Key.Equals("score", StringComparison.OrdinalIgnoreCase) ||
                         entry.Key.Equals("Score", StringComparison.OrdinalIgnoreCase))
                {
                    score = entry.Value.GetInt32();
                }
            }
            
            _logger.LogInformation("Extracted data: PlayerName={PlayerName}, Score={Score}", 
                playerName, score);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing the request data");
            return BadRequest("Error parsing the request data");
        }
        
        if (string.IsNullOrWhiteSpace(playerName))
        {
            _logger.LogWarning("PlayerName is required");
            return BadRequest(new { PlayerName = "The PlayerName field is required." });
        }

        try
        {
            // Sanitize input - we already have playerName from parsing above
            playerName = playerName.Trim();

            // Trim name if too long
            if (playerName.Length > 50)
            {
                playerName = playerName.Substring(0, 50);
            }

            // Create a new LeaderboardEntry
            var entry = new LeaderboardEntry
            {
                PlayerName = playerName,
                Score = score,
                CreatedAt = DateTime.UtcNow
            };

            // Add to database
            await _context.LeaderboardEntries.AddAsync(entry);
            await _context.SaveChangesAsync();

            // Get updated top 10 scores
            var topScores = await _context.LeaderboardEntries
                .OrderByDescending(e => e.Score)
                .Take(10)
                .ToListAsync();

            return new JsonResult(topScores);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving score");
            return StatusCode(500, "An error occurred while saving the score");
        }
    }

    public async Task<IActionResult> OnGetLeaderboardAsync()
    {
        try
        {
            var topScores = await _context.LeaderboardEntries
                .OrderByDescending(entry => entry.Score)
                .Take(10)
                .ToListAsync();

            return new JsonResult(topScores);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving leaderboard");
            return StatusCode(500, "An error occurred while retrieving the leaderboard");
        }
    }
}
