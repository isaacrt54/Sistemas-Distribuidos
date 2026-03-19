import java.rmi.registry.LocateRegistry;
import java.rmi.registry.Registry;

public class VictoryClient {
    public static void main(String[] args) {
        // Recibimos el nombre del jugador como argumento desde la terminal
        String playerName = (args.length > 0) ? args[0] : "JugadorX";
        
        try {
            // Nos conectamos al registro RMI (Asumimos localhost y puerto 1099)
            Registry registry = LocateRegistry.getRegistry("localhost", 1099);
            
            // Buscamos el objeto distribuido por su nombre
            VictoryService stub = (VictoryService) registry.lookup("VictoryService");
            
            // Invocamos el método remoto para generar un código de victoria
            String response = stub.generateVictoryCode(playerName);
            
            // Imprimimos la respuesta del servidor RMI (el código de victoria)
            System.out.println(response);
            
        } catch (Exception e) {
            // Manejo de fallos: Si el servidor RMI está apagado, no rompemos el juego de Node
            System.out.println("OFFLINE-CODE-999");
        }
    }
}