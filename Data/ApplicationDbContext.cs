using Microsoft.EntityFrameworkCore;
using BlockPuzzleGame.Models;

namespace BlockPuzzleGame.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<LeaderboardEntry> LeaderboardEntries { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Seed some initial data
            var fixedDate = new DateTime(2025, 3, 19);
            modelBuilder.Entity<LeaderboardEntry>().HasData(
                new LeaderboardEntry { Id = 1, PlayerName = "Alex", Score = 1240, CreatedAt = fixedDate },
                new LeaderboardEntry { Id = 2, PlayerName = "Morgan", Score = 980, CreatedAt = fixedDate },
                new LeaderboardEntry { Id = 3, PlayerName = "Taylor", Score = 850, CreatedAt = fixedDate },
                new LeaderboardEntry { Id = 4, PlayerName = "Jordan", Score = 720, CreatedAt = fixedDate },
                new LeaderboardEntry { Id = 5, PlayerName = "Casey", Score = 690, CreatedAt = fixedDate }
            );
        }
    }
}
