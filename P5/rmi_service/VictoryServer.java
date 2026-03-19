import java.rmi.registry.LocateRegistry;
import java.rmi.registry.Registry;
import java.rmi.server.UnicastRemoteObject;
import java.util.UUID;

public class VictoryServer implements VictoryService {

    public VictoryServer() {}

    @Override
    public String generateVictoryCode(String playerName) {
        // Generamos un código alfanumérico aleatorio
        String code = "WIN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        System.out.println("[RMI SERVER] Código generado para " + playerName + ": " + code);
        return code;
    }

    public static void main(String args[]) {
        try {
            // Instanciamos el objeto localmente
            VictoryServer obj = new VictoryServer();
            
            // Exportamos el objeto para crear el Stub
            VictoryService stub = (VictoryService) UnicastRemoteObject.exportObject(obj, 0);

            // Iniciamos el registro RMI en el puerto por defecto (1099)
            Registry registry = LocateRegistry.createRegistry(1099);
            
            // Registramos el Stub en el RMI Registry con un nombre único
            registry.bind("VictoryService", stub);

            System.out.println("=========================================");
            System.out.println("Servidor RMI (Objeto Distribuido) LISTO");
            System.out.println("Esperando invocaciones en el puerto 1099...");
            System.out.println("=========================================\n");
        } catch (Exception e) {
            System.err.println("Error en el Servidor RMI: " + e.toString());
            e.printStackTrace();
        }
    }
}