using System;
using System.ComponentModel.DataAnnotations;

namespace BlockPuzzleGame.Models
{
    public class LeaderboardEntry
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(50)]
        public required string PlayerName { get; set; }
        
        [Required]
        public int Score { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
