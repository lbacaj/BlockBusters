using System.ComponentModel.DataAnnotations;

namespace BlockPuzzleGame.Models
{
    public class LeaderboardDTO
    {
        [Required]
        [MaxLength(50)]
        public string PlayerName { get; set; } = string.Empty;
        
        [Required]
        public int Score { get; set; }
    }
}
