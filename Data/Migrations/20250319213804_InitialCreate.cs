using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BlockPuzzleGame.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LeaderboardEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PlayerName = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Score = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeaderboardEntries", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "LeaderboardEntries",
                columns: new[] { "Id", "CreatedAt", "PlayerName", "Score" },
                values: new object[,]
                {
                    { 1, new DateTime(2025, 3, 19, 0, 0, 0, 0, DateTimeKind.Unspecified), "Alex", 1240 },
                    { 2, new DateTime(2025, 3, 19, 0, 0, 0, 0, DateTimeKind.Unspecified), "Morgan", 980 },
                    { 3, new DateTime(2025, 3, 19, 0, 0, 0, 0, DateTimeKind.Unspecified), "Taylor", 850 },
                    { 4, new DateTime(2025, 3, 19, 0, 0, 0, 0, DateTimeKind.Unspecified), "Jordan", 720 },
                    { 5, new DateTime(2025, 3, 19, 0, 0, 0, 0, DateTimeKind.Unspecified), "Casey", 690 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LeaderboardEntries");
        }
    }
}
